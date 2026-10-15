import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccreditationSetStatus,
  JobType,
  StatusEkstraksi,
  TipePanduan,
} from '@ai-led/db';
import { requireEnv } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { JobsService } from '../jobs/jobs.service';
import { extractFileNameFromKey } from '../storage/storage-key.util';
import { StorageService } from '../storage/storage.service';
import { CreateAccreditationSetDto } from './dto/create-accreditation-set.dto';
import { UpdateAccreditationSetDto } from './dto/update-accreditation-set.dto';
import { ReplaceCriteriaDto } from './dto/replace-criteria.dto';
import { AttachSetDocumentDto } from './dto/attach-set-document.dto';
import { ConfirmStructureDto } from './dto/confirm-structure.dto';
import { UploadPanduanDto } from './dto/upload-panduan.dto';
import { AttachPanduanDto } from './dto/attach-panduan.dto';
import { ToggleSectionDto } from './dto/toggle-section.dto';

/// accreditation-set.entity.ts::MIN_KRITERIA_SIAP -- syarat minimum sebelum boleh SIAP.
const MIN_KRITERIA_SIAP = 1;

const CRITERION_INCLUDE = {
  levels: { orderBy: { score: 'desc' as const } },
  criterionChapters: true,
} as const;

@Injectable()
export class AccreditationSetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: StorageService,
    private readonly jobsService: JobsService,
  ) {}

  /** Baris mentah -> bentuk yang dipakai controller, plus dipakaiProyek untuk gerbang kunci di satu round-trip. */
  private async toResponse(
    set: Awaited<ReturnType<AccreditationSetService['findRaw']>>,
  ) {
    const dipakaiProyek = await this.prisma.ledDocument.count({
      where: { accreditationSetId: set.id },
    });
    return { ...set, dipakaiProyek };
  }

  private findRaw(id: string, tenantId: string) {
    return this.prisma.accreditationSet.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        criteria: {
          include: CRITERION_INCLUDE,
          orderBy: [{ indicatorNo: 'asc' }, { subNo: 'asc' }],
        },
        documents: true,
        panduan: true,
      },
    });
  }

  /** dipakaiProyek > 0 -- lihat accreditation-set.entity.ts::deriveSetLock. Mengunci ISI (kriteria+dokumen), bukan identitas set. */
  private async requireUnlocked(id: string, tenantId: string) {
    const set = await this.prisma.accreditationSet.findFirst({
      where: { id, tenantId },
    });
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');

    const dipakaiProyek = await this.prisma.ledDocument.count({
      where: { accreditationSetId: id },
    });
    if (dipakaiProyek > 0) {
      throw new ConflictException(
        `Instrumen ini sudah dipakai ${dipakaiProyek} Dokumen LED, jadi isinya tidak bisa diubah lagi. Duplikasi instrumennya kalau acuannya perlu direvisi.`,
      );
    }
    return set;
  }

  /** Daftar tenant-scoped -- documents dipangkas ke {type} dan criteria ke hitungannya saja (accreditation-set-columns.tsx: kelengkapan berkas + jumlah kriteria), bukan detail penuh yang cuma dipakai halaman detail. */
  async findAll() {
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.accreditationSet.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: { select: { type: true } },
        panduan: { select: { id: true, title: true } },
        _count: { select: { criteria: true } },
      },
    });
  }

  async findById(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.findRaw(id, tenantId).catch(() => null);
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');
    return this.toResponse(set);
  }

  async create(dto: CreateAccreditationSetDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.accreditationSet.create({
      data: {
        tenantId,
        nama: dto.nama,
        lembaga: dto.lembaga,
        tahunSiklus: dto.tahunSiklus,
        status: AccreditationSetStatus.DRAF,
      },
    });
  }

  /**
   * Identitas set (nama/lembaga/tahunSiklus) boleh diubah walau sedang dipakai
   * -- accreditation-set.repository.ts::update (frontend) tidak memanggil
   * requireUnlocked sama sekali, hanya isi (kriteria/dokumen) yang dikunci.
   * status HANYA boleh DRAF (mundur dari SIAP) -- naik ke SIAP lewat markReady
   * karena butuh cekSyaratSiap, bukan sekadar assignment.
   */
  async update(id: string, dto: UpdateAccreditationSetDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const existing = await this.prisma.accreditationSet.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      throw new NotFoundException('Instrumen akreditasi tidak ditemukan');

    return this.prisma.accreditationSet.update({
      where: { id },
      data: {
        nama: dto.nama,
        lembaga: dto.lembaga,
        tahunSiklus: dto.tahunSiklus,
        status: dto.status,
      },
    });
  }

  /**
   * Menandai set siap dipakai -- accreditation-set.repository.ts::markReady.
   * Sekali jalan, tidak ada jalan balik (revisi lewat duplicate, bukan
   * menurunkan status set yang sudah SIAP).
   */
  async markReady(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({
      where: { id, tenantId },
      include: { criteria: true, documents: true },
    });
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');
    if (set.status === AccreditationSetStatus.SIAP) {
      throw new BadRequestException('Instrumen ini sudah ditandai siap.');
    }

    // PANDUAN_LAM tidak lagi lewat `documents` (ReferenceGuide reusable,
    // dipasang lewat AccreditationSet.panduanId) -- DOKUMEN_RUBRIK tetap
    // lewat documents seperti biasa.
    const kosong: TipePanduan[] = [];
    if (!set.documents.some((d) => d.type === TipePanduan.DOKUMEN_RUBRIK)) {
      kosong.push(TipePanduan.DOKUMEN_RUBRIK);
    }
    if (!set.panduanId) {
      kosong.push(TipePanduan.PANDUAN_LAM);
    }
    if (kosong.length > 0) {
      throw new BadRequestException(
        `Instrumen siap harus punya kedua berkas acuan — ${kosong.join(' dan ')} belum ada.`,
      );
    }
    if (set.criteria.length < MIN_KRITERIA_SIAP) {
      throw new BadRequestException(
        'Instrumen siap harus punya isi rubrik — kriteria penilaiannya belum terbaca dari Dokumen Rubrik.',
      );
    }

    return this.prisma.accreditationSet.update({
      where: { id },
      data: { status: AccreditationSetStatus.SIAP },
    });
  }

  /** Ditolak bila masih dipakai -- accreditation-set.repository.ts::delete. */
  async remove(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({
      where: { id, tenantId },
    });
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');

    const dipakaiProyek = await this.prisma.ledDocument.count({
      where: { accreditationSetId: id },
    });
    if (dipakaiProyek > 0) {
      throw new ConflictException(
        `Instrumen ini masih dipakai ${dipakaiProyek} Dokumen LED, jadi tidak bisa dihapus.`,
      );
    }

    await this.prisma.accreditationSet.delete({ where: { id } });
  }

  /**
   * Menyalin set jadi draf baru -- satu-satunya cara merevisi acuan yang sudah
   * terkunci (accreditation-set.repository.ts::duplicate). Kriteria (+level+bab)
   * dan dokumen ikut disalin; statusnya selalu mulai dari DRAF.
   */
  async duplicate(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const source = await this.findRaw(id, tenantId).catch(() => null);
    if (!source) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');

    const namaDasar = `${source.nama} (salinan)`;
    const namaTerpakai = new Set(
      (
        await this.prisma.accreditationSet.findMany({
          where: { tenantId },
          select: { nama: true },
        })
      ).map((s) => s.nama),
    );
    let nama = namaDasar;
    let urutan = 2;
    while (namaTerpakai.has(nama)) {
      nama = `${namaDasar} ${urutan}`;
      urutan += 1;
    }

    const salinan = await this.prisma.accreditationSet.create({
      data: {
        tenantId,
        nama,
        lembaga: source.lembaga,
        tahunSiklus: source.tahunSiklus,
        status: AccreditationSetStatus.DRAF,
        // Panduan reusable -- salin POINTER-nya (Set baru pakai Panduan yang
        // sama, sumbernya identik), bukan baris ReferenceGuide-nya.
        panduanId: source.panduanId,
        documents: {
          // PANDUAN_LAM sudah tidak lagi lewat `documents` sejak jadi
          // reusable -- baris lama (kalau masih ada, pra-migrasi) tidak ikut
          // disalin, cuma jadi ReferenceGuide yatim yang tidak dipakai siapa pun.
          create: source.documents
            .filter((d) => d.type !== TipePanduan.PANDUAN_LAM)
            .map((d) => ({
              tenantId,
              type: d.type,
              title: d.title,
              fileUrl: d.fileUrl,
              fileType: d.fileType,
            })),
        },
        criteria: {
          create: source.criteria.map((c) => ({
            indicatorNo: c.indicatorNo,
            // Tanpa subNo, dua sub-indikator bernomor sama (43.I/43.II) bentrok di indeks unik saat disalin.
            subNo: c.subNo,
            criterionCode: c.criterionCode,
            criterionGroup: c.criterionGroup,
            description: c.description,
            scoreType: c.scoreType,
            lkpsTableRefs: c.lkpsTableRefs,
            formula: c.formula,
            subScoreFormula: c.subScoreFormula,
            levels: {
              create: c.levels.map((l) => ({
                score: l.score,
                description: l.description,
              })),
            },
            criterionChapters: {
              create: c.criterionChapters.map((cc) => ({
                chapterOrder: cc.chapterOrder,
              })),
            },
          })),
        },
      },
      include: { criteria: { include: CRITERION_INCLUDE }, documents: true },
    });
    await this.salinGrupHierarki(source, salinan.id);
    return salinan;
  }

  /**
   * Menyalin pengelompokan hierarki rubrik (kelompok > kriteria > IKU) ke set salinan dan menautkan ulang
   * tiap kriteria ke grup barunya. Tanpa ini salinan kehilangan struktur induk-anak rubrik (group_id kosong).
   * Kriteria dicocokkan lewat (nomor indikator, sub-indikator), kunci yang sama dengan indeks unik rubric_criteria.
   */
  private async salinGrupHierarki(
    source: { id: string; criteria: { indicatorNo: number; subNo: string | null; groupId: string | null }[] },
    setBaruId: string,
  ) {
    const grup = await this.prisma.rubricCriterionGroup.findMany({
      where: { accreditationSetId: source.id },
      orderBy: { order: 'asc' },
    });
    if (grup.length === 0) return;

    const peta = new Map<string, string>(); // id grup lama -> id grup baru
    let sisa = grup;
    // Induk lebih dulu: ulangi sampai semua grup yang induknya sudah tersalin habis (kedalaman terbatas, 3 tingkat).
    for (let putaran = 0; sisa.length > 0 && putaran < 10; putaran += 1) {
      const belum: typeof grup = [];
      for (const g of sisa) {
        if (g.parentId && !peta.has(g.parentId)) {
          belum.push(g);
          continue;
        }
        const baru = await this.prisma.rubricCriterionGroup.create({
          data: {
            accreditationSetId: setBaruId,
            parentId: g.parentId ? peta.get(g.parentId)! : null,
            level: g.level,
            order: g.order,
            marker: g.marker,
            label: g.label,
          },
        });
        peta.set(g.id, baru.id);
      }
      sisa = belum;
    }

    for (const c of source.criteria) {
      const grupBaru = c.groupId ? peta.get(c.groupId) : undefined;
      if (!grupBaru) continue;
      await this.prisma.rubricCriterion.updateMany({
        where: { accreditationSetId: setBaruId, indicatorNo: c.indicatorNo, subNo: c.subNo },
        data: { groupId: grupBaru },
      });
    }
  }

  /**
   * Menimpa SELURUH daftar kriteria sekaligus -- disengaja, lihat
   * accreditation-set.repository.ts komentar di atas updateCriterion ("Tidak
   * ada pasangan addCriterion"): isi rubrik turun dari berkas yang diunggah
   * sekaligus satu daftar penuh (auto-parse jadi follow-up round), bukan
   * ditambah satu per satu. Endpoint ini adalah kontrak yang sama itu.
   */
  async replaceCriteria(id: string, dto: ReplaceCriteriaDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.requireUnlocked(id, tenantId);

    // Kunci keunikan = nomor + sub-indikator (sama dengan indeks unik rubric_criteria): 43.I dan 43.II sah.
    // ponytail: dulu hanya `indicatorNo` -- menolak seluruh set yang punya sub-indikator.
    const nomorTerpakai = new Set<string>();
    for (const k of dto.criteria) {
      const kunci = `${k.indicatorNo}|${k.subNo ?? ''}`;
      if (nomorTerpakai.has(kunci)) {
        throw new BadRequestException(
          `Nomor indikator ${k.indicatorNo}${k.subNo ? ` (sub ${k.subNo})` : ''} dipakai lebih dari satu kriteria dalam daftar ini.`,
        );
      }
      nomorTerpakai.add(kunci);
    }

    return this.prisma.$transaction(async (tx) => {
      return this.tenantContext.runInManagedTransaction(async () => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        // Ingat grup hierarki tiap kriteria sebelum dihapus: payload tidak membawa group_id, jadi tanpa ini
        // setiap penyuntingan lewat UI memutus kriteria dari induknya (kelompok > kriteria > IKU).
        const grupLama = new Map(
          (
            await tx.rubricCriterion.findMany({
              where: { accreditationSetId: id },
              select: { indicatorNo: true, subNo: true, groupId: true },
            })
          ).map((c) => [`${c.indicatorNo}|${c.subNo ?? ''}`, c.groupId]),
        );
        await tx.rubricCriterion.deleteMany({
          where: { accreditationSetId: id },
        });
        for (const k of dto.criteria) {
          await tx.rubricCriterion.create({
            data: {
              accreditationSetId: id,
              indicatorNo: k.indicatorNo,
              subNo: k.subNo || null,
              groupId: grupLama.get(`${k.indicatorNo}|${k.subNo ?? ''}`) ?? null,
              criterionCode: k.criterionCode,
              criterionGroup: k.criterionGroup,
              description: k.description,
              scoreType: k.scoreType,
              lkpsTableRefs: k.lkpsTableRefs,
              formula: k.formula ?? null,
              subScoreFormula: k.subScoreFormula ?? null,
              levels: {
                create: k.levels.map((l) => ({
                  score: l.score,
                  description: l.description,
                })),
              },
              criterionChapters: {
                create: k.chapterOrders.map((chapterOrder) => ({
                  chapterOrder,
                })),
              },
            },
          });
        }
        return tx.accreditationSet.findFirstOrThrow({
          where: { id },
          include: {
            criteria: {
              include: CRITERION_INCLUDE,
              orderBy: [{ indicatorNo: 'asc' }, { subNo: 'asc' }],
            },
          },
        });
      });
    });
  }

  async removeCriterion(id: string, criterionId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.requireUnlocked(id, tenantId);

    const criterion = await this.prisma.rubricCriterion.findFirst({
      where: { id: criterionId, accreditationSetId: id },
    });
    if (!criterion) throw new NotFoundException('Kriteria tidak ditemukan');

    await this.prisma.rubricCriterion.delete({ where: { id: criterionId } });
  }

  /** Mengosongkan satu slot acuan -- accreditation-set.repository.ts::removeDocument. No-op kalau slotnya memang sudah kosong. */
  async removeDocument(id: string, type: TipePanduan) {
    if (type === TipePanduan.PANDUAN_LAM) {
      throw new BadRequestException(
        'Panduan Penulisan sekarang reusable antar Set -- pakai DELETE /accreditation-sets/:id/panduan.',
      );
    }
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.requireUnlocked(id, tenantId);

    await this.prisma.referenceGuide.deleteMany({
      where: { accreditationSetId: id, type },
    });
  }

  /**
   * Menyimpan metadata + berkas satu slot acuan (TEMPLATE_LKPS/DOKUMEN_RUBRIK
   * -- PANDUAN_LAM ditolak, lihat uploadPanduan/attachPanduan) ke
   * ReferenceGuide -- fileKey sudah sampai di R2 lewat presigned PUT sebelum
   * ini dipanggil, sama seperti BuktiDukungService.create.
   */
  async attachDocument(
    id: string,
    type: TipePanduan,
    dto: AttachSetDocumentDto,
  ) {
    if (type === TipePanduan.PANDUAN_LAM) {
      throw new BadRequestException(
        'Panduan Penulisan sekarang reusable antar Set -- pakai POST /panduan (baru) atau PATCH /accreditation-sets/:id/panduan (pilih existing).',
      );
    }
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({
      where: { id, tenantId },
    });
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');

    await this.requireUnlocked(id, tenantId);

    const { sizeBytes } = await this.headTenantObject(tenantId, dto.fileKey);
    const originalFileName = extractFileNameFromKey(dto.fileKey);
    const fileType = (originalFileName.split('.').pop() ?? '').toLowerCase();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const existing = await this.prisma.referenceGuide.findFirst({
      where: { accreditationSetId: id, type },
    });

    const saved = existing
      ? await this.prisma.referenceGuide.update({
          where: { id: existing.id },
          data: {
            title: dto.title,
            fileUrl: dto.fileKey,
            fileType,
            sizeBytes,
            uploadedByUserId: userId,
            uploadedByName: user.fullName,
          },
        })
      : await this.prisma.referenceGuide.create({
          data: {
            tenantId,
            accreditationSetId: id,
            type,
            title: dto.title,
            fileUrl: dto.fileKey,
            fileType,
            sizeBytes,
            uploadedByUserId: userId,
            uploadedByName: user.fullName,
          },
        });

    // DOKUMEN_RUBRIK saja yang jadi sumber kriteria -- TEMPLATE_LKPS cuma
    // dokumen acuan, disimpan apa adanya di atas tanpa ekstraksi apapun.
    if (type === TipePanduan.DOKUMEN_RUBRIK) {
      await this.prisma.accreditationSet.update({
        where: { id },
        data: {
          criteriaParseStatus: StatusEkstraksi.DIPROSES,
          criteriaParseError: null,
        },
      });
      await this.jobsService.enqueue(JobType.INGESTION_RUBRIK_DOKUMEN, {
        accreditationSetId: id,
        fileUrl: dto.fileKey,
      });
    }

    return saved;
  }

  /** Semua Panduan Penulisan tenant ini -- dropdown "pilih existing" saat
   * pasang ke Set, dan daftar utk kartu Panduan. jumlahSetPemakai dipakai FE
   * sebagai peringatan sebelum replacePanduan ("akan mempengaruhi N Set
   * lain"), bukan endpoint terpisah. */
  async listPanduan() {
    const { tenantId } = this.tenantContext.getOrThrow();
    const panduan = await this.prisma.referenceGuide.findMany({
      where: { tenantId, type: TipePanduan.PANDUAN_LAM },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chapterTemplates: true, usedBySets: true } } },
    });
    return panduan.map((p) => ({
      id: p.id,
      title: p.title,
      structureParseStatus: p.structureParseStatus,
      structureParseError: p.structureParseError,
      createdAt: p.createdAt,
      jumlahBab: p._count.chapterTemplates,
      jumlahSetPemakai: p._count.usedBySets,
    }));
  }

  /** Panduan yang tidak dipakai Set manapun lagi (mis. semua Set-nya dihapus)
   * jadi orphan permanen tanpa ini -- panduanId.onDelete: SetNull sengaja
   * cuma melepas tautan Set, tidak pernah menghapus baris Panduan-nya
   * sendiri (lihat listPanduan). Ditolak selama masih dipakai >=1 Set -- FE
   * menampilkan jumlahSetPemakai (dari listPanduan) supaya tombol hapus
   * disabled duluan, bukan menunggu error ini. ChapterTemplate/GuideDetail
   * ikut kehapus lewat onDelete: Cascade di schema, tidak perlu manual. */
  async deletePanduan(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const panduan = await this.prisma.referenceGuide.findFirst({
      where: { id, tenantId, type: TipePanduan.PANDUAN_LAM },
      include: { _count: { select: { usedBySets: true } } },
    });
    if (!panduan) throw new NotFoundException('Panduan tidak ditemukan');
    if (panduan._count.usedBySets > 0) {
      throw new ConflictException(
        `Panduan ini masih dipakai ${panduan._count.usedBySets} Instrumen Akreditasi, tidak bisa dihapus`,
      );
    }

    await this.prisma.referenceGuide.delete({ where: { id } });
    try {
      await this.storage.deleteObject(panduan.fileUrl);
    } catch {
      // Object already gone (or a pre-R2 row) — not a reason to fail the row delete.
    }
  }

  /** R2 key must sit under this tenant's prefix -- otherwise a leaked key would ingest (and later delete) another tenant's file. */
  private headTenantObject(tenantId: string, fileKey: string) {
    if (!fileKey.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('fileKey ini bukan milik tenant Anda');
    }
    return this.storage.headObject(fileKey);
  }

  /** Upload Panduan BARU (mode "Baru" dimas, `57a55b0`) -- tenant-scoped,
   * belum terpasang ke Set manapun sampai attachPanduan dipanggil terpisah
   * (FE: upload lalu langsung attach ke Set yang sedang dibuka). */
  async uploadPanduan(dto: UploadPanduanDto) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const { sizeBytes } = await this.headTenantObject(tenantId, dto.fileKey);
    const fileType = (extractFileNameFromKey(dto.fileKey).split('.').pop() ?? '').toLowerCase();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const panduan = await this.prisma.referenceGuide.create({
      data: {
        tenantId,
        type: TipePanduan.PANDUAN_LAM,
        title: dto.title,
        fileUrl: dto.fileKey,
        fileType,
        sizeBytes,
        uploadedByUserId: userId,
        uploadedByName: user.fullName,
        structureParseStatus: StatusEkstraksi.DIPROSES,
      },
    });
    await this.jobsService.enqueue(JobType.INGESTION_STRUKTUR_DOKUMEN, {
      guideId: panduan.id,
      fileUrl: dto.fileKey,
    });
    return panduan;
  }

  /** Re-upload KE Panduan yang sudah ada (mode "Replace" dimas) -- wipe +
   * re-extract, SEMUA Set yang menunjuknya (AccreditationSet.panduanId)
   * otomatis ikut struktur baru begitu di-confirm ulang. FE menampilkan
   * jumlahSetPemakai (dari listPanduan) sebagai peringatan sebelum memanggil ini. */
  async replacePanduan(panduanId: string, dto: UploadPanduanDto) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const existing = await this.prisma.referenceGuide.findFirst({
      where: { id: panduanId, tenantId, type: TipePanduan.PANDUAN_LAM },
    });
    if (!existing) throw new NotFoundException('Panduan tidak ditemukan');

    const { sizeBytes } = await this.headTenantObject(tenantId, dto.fileKey);
    const fileType = (extractFileNameFromKey(dto.fileKey).split('.').pop() ?? '').toLowerCase();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const panduan = await this.prisma.referenceGuide.update({
      where: { id: panduanId },
      data: {
        title: dto.title,
        fileUrl: dto.fileKey,
        fileType,
        sizeBytes,
        uploadedByUserId: userId,
        uploadedByName: user.fullName,
        structureParseStatus: StatusEkstraksi.DIPROSES,
        structureParseError: null,
      },
    });
    await this.jobsService.enqueue(JobType.INGESTION_STRUKTUR_DOKUMEN, {
      guideId: panduan.id,
      fileUrl: dto.fileKey,
    });
    return panduan;
  }

  /** Pasang Panduan (baru diupload ATAU sudah ada) ke Set ini -- pengganti
   * attachDocument(PANDUAN_LAM) lama sekarang Panduan jadi entitas sendiri,
   * bukan slot ReferenceGuide milik satu Set. */
  async attachPanduan(id: string, dto: AttachPanduanDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.requireUnlocked(id, tenantId);

    const panduan = await this.prisma.referenceGuide.findFirst({
      where: { id: dto.panduanId, tenantId, type: TipePanduan.PANDUAN_LAM },
    });
    if (!panduan) throw new NotFoundException('Panduan tidak ditemukan');

    return this.prisma.accreditationSet.update({
      where: { id },
      data: { panduanId: panduan.id },
    });
  }

  /** Lepas Panduan dari Set ini -- TIDAK menghapus baris Panduan-nya sendiri
   * (Set lain masih boleh memakainya), cuma nol-in pointer-nya. Pengganti
   * removeDocument(id, 'PANDUAN_LAM') lama. */
  async detachPanduan(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.requireUnlocked(id, tenantId);
    await this.prisma.accreditationSet.update({
      where: { id },
      data: { panduanId: null },
    });
  }

  /** gap: nyala/matiin 1 sub-bab yang SUDAH commit dari outline BARU, tanpa
   * re-extract seluruh Panduan (lihat SubBabTemplate.isActive). Prisma
   * langsung, bukan proxy ke apps/ai -- toggle boolean murni, tidak ada
   * ekstraksi/LLM yang butuh Python. SubBabTemplate tidak punya tenantId
   * langsung, jadi isolasi tenant dicek lewat rantai
   * chapterTemplate->guide->tenantId. */
  async toggleSection(subBabId: string, dto: ToggleSectionDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const subBab = await this.prisma.subBabTemplate.findFirst({
      where: { id: subBabId, chapterTemplate: { guide: { tenantId } } },
    });
    if (!subBab) throw new NotFoundException('Sub-bab tidak ditemukan');

    return this.prisma.subBabTemplate.update({
      where: { id: subBabId },
      data: { isActive: dto.isActive },
    });
  }

  /** Struktur bab/sub-bab resmi Panduan yang dipasang ke set ini
   * (worker.py::_handle_ingestion_struktur_dokumen) -- [] kalau set belum
   * punya Panduan terpasang, atau Panduan-nya belum pernah diekstrak. */
  async findChapterTemplates(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({
      where: { id, tenantId },
    });
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');
    if (!set.panduanId) return [];

    const templates = await this.prisma.chapterTemplate.findMany({
      where: { guideId: set.panduanId },
      orderBy: { order: 'asc' },
      include: { subBab: { orderBy: { order: 'asc' } } },
    });
    // Nested to any depth (dimas: every Panduan node is a section) -- `subBab` = top level, rest via `children`.
    return templates.map(({ subBab, ...template }) => {
      type Node = (typeof subBab)[number] & { children: Node[] };
      const byParent = new Map<string | null, Node[]>();
      for (const row of subBab) {
        const node: Node = { ...row, children: [] };
        byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), node]);
      }
      const attach = (nodes: Node[]): Node[] =>
        nodes.map((node) => ({ ...node, children: attach(byParent.get(node.id) ?? []) }));
      return { ...template, subBab: attach(byParent.get(null) ?? []) };
    });
  }

  /** Proxy ke apps/ai's GET /structure/:guideId/preview, diresolve dari
   * Panduan yang terpasang ke set ini (set.panduanId) -- pohon bab/sub-bab
   * hasil ekstraksi MENUNGGU_KONFIRMASI (belum di-commit), atau struktur
   * yang sudah commit kalau tidak sedang menunggu. Modal "Pilih Struktur
   * Pedoman" di frontend baca dari sini, bukan dari findChapterTemplates. */
  async previewStructure(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({ where: { id, tenantId } });
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');
    if (!set.panduanId) {
      throw new BadRequestException('Instrumen ini belum punya Panduan Penulisan terpasang');
    }

    const aiServiceUrl = requireEnv('AI_SERVICE_URL');
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/structure/${set.panduanId}/preview`);
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }
    if (!upstream.ok) {
      throw new BadGatewayException('Gagal memuat preview struktur');
    }
    return upstream.json();
  }

  /** Proxy ke apps/ai's POST /structure/:guideId/confirm, diresolve dari
   * set.panduanId -- commit HANYA node yang tercentang di modal ke
   * ChapterTemplate/SubBabTemplate (milik Panduan itu, jadi berlaku utk
   * semua Set lain yang menunjuknya juga); sisanya dibuang permanen
   * (apps/ai/db/postgres_client.py::confirm_structure_staging). */
  async confirmStructure(id: string, dto: ConfirmStructureDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({ where: { id, tenantId } });
    if (!set) throw new NotFoundException('Instrumen akreditasi tidak ditemukan');
    if (!set.panduanId) {
      throw new BadRequestException('Instrumen ini belum punya Panduan Penulisan terpasang');
    }

    const aiServiceUrl = requireEnv('AI_SERVICE_URL');
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/structure/${set.panduanId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted_ids: dto.acceptedIds }),
      });
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }
    if (upstream.status === 409) {
      throw new ConflictException('Struktur ini tidak sedang menunggu konfirmasi');
    }
    if (!upstream.ok) {
      throw new BadGatewayException('Gagal menyimpan konfirmasi struktur');
    }
    return upstream.json();
  }
}
