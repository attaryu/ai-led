import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccreditationSetStatus, TipePanduan } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { extractFileNameFromKey } from '../storage/storage-key.util';
import { StorageService } from '../storage/storage.service';
import { CreateAccreditationSetDto } from './dto/create-accreditation-set.dto';
import { UpdateAccreditationSetDto } from './dto/update-accreditation-set.dto';
import { ReplaceCriteriaDto } from './dto/replace-criteria.dto';
import { AttachSetDocumentDto } from './dto/attach-set-document.dto';

/// accreditation-set.entity.ts::MIN_KRITERIA_SIAP -- syarat minimum sebelum boleh SIAP.
const MIN_KRITERIA_SIAP = 1;
const SET_DOCUMENT_TYPES = Object.values(TipePanduan);

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
      include: { criteria: { include: CRITERION_INCLUDE, orderBy: { indicatorNo: 'asc' } }, documents: true },
    });
  }

  /** dipakaiProyek > 0 -- lihat accreditation-set.entity.ts::deriveSetLock. Mengunci ISI (kriteria+dokumen), bukan identitas set. */
  private async requireUnlocked(id: string, tenantId: string) {
    const set = await this.prisma.accreditationSet.findFirst({ where: { id, tenantId } });
    if (!set) throw new NotFoundException('Set akreditasi tidak ditemukan');

    const dipakaiProyek = await this.prisma.ledDocument.count({
      where: { accreditationSetId: id },
    });
    if (dipakaiProyek > 0) {
      throw new ConflictException(
        `Set ini sudah dipakai ${dipakaiProyek} Dokumen LED, jadi isinya tidak bisa diubah lagi. Duplikasi setnya kalau acuannya perlu direvisi.`,
      );
    }
    return set;
  }

  async findAll() {
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.accreditationSet.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.findRaw(id, tenantId).catch(() => null);
    if (!set) throw new NotFoundException('Set akreditasi tidak ditemukan');
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
    const existing = await this.prisma.accreditationSet.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Set akreditasi tidak ditemukan');

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
    if (!set) throw new NotFoundException('Set akreditasi tidak ditemukan');
    if (set.status === AccreditationSetStatus.SIAP) {
      throw new BadRequestException('Set ini sudah ditandai siap.');
    }

    const kosong = SET_DOCUMENT_TYPES.filter(
      (tipe) => !set.documents.some((d) => d.type === tipe),
    );
    if (kosong.length > 0) {
      throw new BadRequestException(
        `Set siap harus punya ketiga berkas acuan — ${kosong.join(' dan ')} belum ada.`,
      );
    }
    if (set.criteria.length < MIN_KRITERIA_SIAP) {
      throw new BadRequestException(
        'Set siap harus punya isi rubrik — kriteria penilaiannya belum terbaca dari Dokumen Rubrik.',
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
    const set = await this.prisma.accreditationSet.findFirst({ where: { id, tenantId } });
    if (!set) throw new NotFoundException('Set akreditasi tidak ditemukan');

    const dipakaiProyek = await this.prisma.ledDocument.count({
      where: { accreditationSetId: id },
    });
    if (dipakaiProyek > 0) {
      throw new ConflictException(
        `Set ini masih dipakai ${dipakaiProyek} Dokumen LED, jadi tidak bisa dihapus.`,
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
    if (!source) throw new NotFoundException('Set akreditasi tidak ditemukan');

    const namaDasar = `${source.nama} (salinan)`;
    const namaTerpakai = new Set(
      (await this.prisma.accreditationSet.findMany({ where: { tenantId }, select: { nama: true } })).map(
        (s) => s.nama,
      ),
    );
    let nama = namaDasar;
    let urutan = 2;
    while (namaTerpakai.has(nama)) {
      nama = `${namaDasar} ${urutan}`;
      urutan += 1;
    }

    return this.prisma.accreditationSet.create({
      data: {
        tenantId,
        nama,
        lembaga: source.lembaga,
        tahunSiklus: source.tahunSiklus,
        status: AccreditationSetStatus.DRAF,
        documents: {
          create: source.documents.map((d) => ({
            type: d.type,
            title: d.title,
            fileUrl: d.fileUrl,
            fileType: d.fileType,
          })),
        },
        criteria: {
          create: source.criteria.map((c) => ({
            indicatorNo: c.indicatorNo,
            criterionCode: c.criterionCode,
            criterionGroup: c.criterionGroup,
            description: c.description,
            scoreType: c.scoreType,
            lkpsTableRefs: c.lkpsTableRefs,
            formula: c.formula,
            subScoreFormula: c.subScoreFormula,
            levels: { create: c.levels.map((l) => ({ score: l.score, description: l.description })) },
            criterionChapters: {
              create: c.criterionChapters.map((cc) => ({ chapterOrder: cc.chapterOrder })),
            },
          })),
        },
      },
      include: { criteria: { include: CRITERION_INCLUDE }, documents: true },
    });
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

    const nomorTerpakai = new Set<number>();
    for (const k of dto.criteria) {
      if (nomorTerpakai.has(k.indicatorNo)) {
        throw new BadRequestException(
          `Nomor indikator ${k.indicatorNo} dipakai lebih dari satu kriteria dalam daftar ini.`,
        );
      }
      nomorTerpakai.add(k.indicatorNo);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rubricCriterion.deleteMany({ where: { accreditationSetId: id } });
      for (const k of dto.criteria) {
        await tx.rubricCriterion.create({
          data: {
            accreditationSetId: id,
            indicatorNo: k.indicatorNo,
            criterionCode: k.criterionCode,
            criterionGroup: k.criterionGroup,
            description: k.description,
            scoreType: k.scoreType,
            lkpsTableRefs: k.lkpsTableRefs,
            formula: k.formula ?? null,
            subScoreFormula: k.subScoreFormula ?? null,
            levels: { create: k.levels.map((l) => ({ score: l.score, description: l.description })) },
            criterionChapters: {
              create: k.chapterOrders.map((chapterOrder) => ({ chapterOrder })),
            },
          },
        });
      }
      return tx.accreditationSet.findFirstOrThrow({
        where: { id },
        include: { criteria: { include: CRITERION_INCLUDE, orderBy: { indicatorNo: 'asc' } } },
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

  /**
   * Menyimpan metadata + berkas satu slot acuan (PANDUAN_LAM/TEMPLATE_LKPS/
   * DOKUMEN_RUBRIK) ke ReferenceGuide -- fileKey sudah sampai di R2 lewat
   * presigned PUT sebelum ini dipanggil, sama seperti BuktiDukungService.create.
   */
  async attachDocument(id: string, type: TipePanduan, dto: AttachSetDocumentDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const set = await this.prisma.accreditationSet.findFirst({ where: { id, tenantId } });
    if (!set) throw new NotFoundException('Set akreditasi tidak ditemukan');

    await this.requireUnlocked(id, tenantId);

    await this.storage.headObject(dto.fileKey);
    const originalFileName = extractFileNameFromKey(dto.fileKey);
    const fileType = (originalFileName.split('.').pop() ?? '').toLowerCase();

    const existing = await this.prisma.referenceGuide.findFirst({
      where: { accreditationSetId: id, type },
    });

    if (existing) {
      return this.prisma.referenceGuide.update({
        where: { id: existing.id },
        data: { title: dto.title, fileUrl: dto.fileKey, fileType },
      });
    }
    return this.prisma.referenceGuide.create({
      data: {
        accreditationSetId: id,
        type,
        title: dto.title,
        fileUrl: dto.fileKey,
        fileType,
      },
    });
  }
}
