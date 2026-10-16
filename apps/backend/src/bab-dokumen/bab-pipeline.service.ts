import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceKind, JobType, Prisma, Role, StatusEkstraksi, StatusRekomendasi } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { ConfirmRecommendationDto } from './dto/confirm-recommendation.dto';
import { collectGroupSubtree, resolveAnchorGroupId } from './section-indicator.util';

type ProseNode = Record<string, unknown>;

/** Penanda `pending` penilaian RAGAS yang lebih tua dari ini dianggap macet (worker mati) dan boleh dipicu ulang. */
const PENILAIAN_RAGAS_BATAS_MS = 20 * 60 * 1000;

/** Block nodes of a section's ProseMirror doc; rows saved before content became a doc ({format:'html', body}) degrade to one paragraph of their text. */
function proseNodes(content: unknown): ProseNode[] {
  const c = content as { type?: string; content?: ProseNode[]; body?: string } | null;
  if (c?.type === 'doc') return c.content ?? [];
  const text = (c?.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [];
}

/** GENERASI_OUTLINE_BAB / GENERASI_BAB / SIMULASI_SKOR / REKOMENDASI_DOKUMEN job triggers, the recommend->confirm flow, and the chat-proxy access check. */
@Injectable()
export class BabPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jobsService: JobsService,
    private readonly access: BabAccessService,
  ) {}

  /** Enqueues GENERASI_OUTLINE_BAB — apps/ai's worker menyusun daftar section (LLM), dituntun kelompok kriteria rubrik bab ini. */
  async triggerGenerateOutline(id: string, overwrite?: boolean) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    return this.jobsService.enqueue(JobType.GENERASI_OUTLINE_BAB, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(overwrite ? { overwrite: true } : {}),
    });
  }

  /**
   * GET bab/:id/sections — daftar outline section, terurut.
   *
   * ponytail: `content` yang dikirim ke web diambil dari DRAFT YANG SEDANG
   * DIPILIH (`activeCheckpoint.contentSnapshot`), bukan langsung dari
   * `ChapterSection.content`. Draft adalah sumber kebenaran narasi: tiap
   * generate membuat satu dan menjadikannya terpilih, dan memilih draft lain
   * berarti menampilkan narasi itu di kanvas.
   *
   * `section.content` tetap dipertahankan sebagai cermin -- kompilasi bab,
   * skoring, dan ingestion LED membacanya, jadi tidak diubah di sini.
   * Fallback ke `section.content` menjaga baris lama yang belum punya draft.
   *
   * Ini juga memperbaiki kasus nyata: generate yang GAGAL meninggalkan
   * `section.content` kosong (status ERROR) padahal narasi lengkap masih ada
   * di snapshot draft -- kanvas dulu ikut kosong tanpa sebab yang terlihat.
   */
  async findSections(id: string) {
    await this.access.findOneScoped(id);
    const sections = await this.prisma.chapterSection.findMany({
      where: { chapterId: id },
      orderBy: { order: 'asc' },
      include: { activeCheckpoint: { select: { contentSnapshot: true } } },
    });
    return sections.map(({ activeCheckpoint, ...section }) => ({
      ...section,
      content: activeCheckpoint?.contentSnapshot ?? section.content,
    }));
  }

  /**
   * GET bab/:id/sections/:sectionId/indikator -- indikator matriks penilaian
   * yang dipetakan ke section ini (dasar panel "Penilaian Indikator").
   *
   * Pemetaan lewat tabel `set_section_criterion_links` (jangkar), diwarisi
   * sub-bab lewat parentId -- lihat section-indicator.util.ts. Kosong bila set
   * akreditasi dokumen belum dipilih, belum ada tautan, atau section ini di luar
   * jangkar mana pun; itu keadaan sah, bukan galat.
   */
  async findIndicatorsForSection(id: string, sectionId: string) {
    const bab = await this.access.findOneScoped(id);
    const setId = bab.document.accreditationSetId;
    if (!setId) return [];

    const sections = await this.prisma.chapterSection.findMany({
      where: { chapterId: id },
      select: { id: true, parentId: true, title: true },
    });
    if (!sections.some((s) => s.id === sectionId)) {
      throw new NotFoundException('Section tidak ditemukan');
    }

    const links = await this.prisma.setSectionCriterionLink.findMany({
      where: { accreditationSetId: setId },
      select: { criterionGroupId: true, subBabTemplate: { select: { title: true } } },
    });
    const groupId = resolveAnchorGroupId(
      sectionId,
      sections,
      links.map((l) => ({ templateTitle: l.subBabTemplate.title, criterionGroupId: l.criterionGroupId })),
    );
    if (!groupId) return [];

    const groups = await this.prisma.rubricCriterionGroup.findMany({
      where: { accreditationSetId: setId },
      select: { id: true, parentId: true },
    });
    const criteria = await this.prisma.rubricCriterion.findMany({
      where: { accreditationSetId: setId, groupId: { in: [...collectGroupSubtree(groupId, groups)] } },
      orderBy: [{ indicatorNo: 'asc' }, { subNo: 'asc' }],
      select: { id: true, criterionCode: true, indicatorNo: true, subNo: true, description: true, scoreType: true },
    });
    return criteria.map((c) => ({
      id: c.id,
      kode: c.criterionCode,
      no: c.indicatorNo,
      subNo: c.subNo ?? '',
      deskripsi: c.description,
      tipeSkor: c.scoreType,
    }));
  }

  /**
   * GET bab/:id/sections/:sectionId/sumber — chunk asli yang dipakai AI
   * menyusun section ini (worker.py::_handle_generasi_bab's `chunks_used`),
   * backing the citation hover-card di editor. `null` (bukan array kosong)
   * kalau section ini belum pernah digenerate lewat job ini (ditulis manual,
   * atau digenerate sebelum kolom `section_id` ada) -- beda dari "digenerate
   * tapi tidak ada bukti terpakai", yang sah berupa array kosong.
   */
  async findSourcesForSection(id: string, sectionId: string) {
    await this.access.findOneScoped(id);
    const section = await this.prisma.chapterSection.findFirst({ where: { id: sectionId, chapterId: id } });
    if (!section) {
      throw new NotFoundException('Section tidak ditemukan');
    }

    const run = await this.prisma.generationRun.findFirst({
      where: { sectionId },
      orderBy: { createdAt: 'desc' },
      select: {
        chunksUsed: true,
        createdAt: true,
        chapterDraftId: true,
        judgeResult: true,
        latencySec: true,
        model: true,
        checklist: true,
        checklistError: true,
      },
    });
    if (!run) return null;

    // Tiap chunk "evidence" (worker.py::search_evidence) bawa `bukti_dukung_id`
    // apa adanya (chunks_used cuma json.dumps langsung, lihat generation_client.py)
    // -- di sini di-resolve jadi `fileUrl` (R2 object key, BUKAN URL siap-pakai)
    // supaya citation hover-card (apps/web) bisa minta presigned-download tanpa
    // endpoint "evidence by id" terpisah.
    const chunksUsed = (run.chunksUsed as Record<string, unknown>[]) ?? [];
    const evidenceIds = [
      ...new Set(
        chunksUsed
          .filter((c) => c.kind === 'evidence' && typeof c.bukti_dukung_id === 'string')
          .map((c) => c.bukti_dukung_id as string),
      ),
    ];
    const fileUrlById = new Map(
      evidenceIds.length
        ? (
            await this.prisma.evidence.findMany({
              where: { id: { in: evidenceIds } },
              select: { id: true, fileUrl: true },
            })
          ).map((e) => [e.id, e.fileUrl])
        : [],
    );
    const chunksUsedWithFileUrl = chunksUsed.map((c) => ({
      ...c,
      fileUrl:
        c.kind === 'evidence' && typeof c.bukti_dukung_id === 'string'
          ? (fileUrlById.get(c.bukti_dukung_id) ?? null)
          : null,
    }));

    // ponytail: pilihan centang yang BISA DIUBAH menang; daftar link generate
    // terakhir hanya dipakai kalau section ini belum pernah disetel (baris lama).
    // evidence_draft_links append-only, jadi memakainya sebagai sumber utama
    // membuat uncheck mustahil bertahan -- centangnya kembali tiap muat ulang.
    const tersimpan = await this.prisma.chapterSection.findUnique({
      where: { id: sectionId },
      select: { selectedEvidenceIds: true },
    });
    const selectedEvidenceIds = Array.isArray(tersimpan?.selectedEvidenceIds)
      ? (tersimpan.selectedEvidenceIds as unknown[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : (
          await this.prisma.evidenceDraftLink.findMany({
            where: { draftId: run.chapterDraftId },
            select: { evidenceId: true },
          })
        ).map((l) => l.evidenceId);

    return {
      chunksUsed: chunksUsedWithFileUrl,
      generatedAt: run.createdAt,
      selectedEvidenceIds,
      // dimas SectionInfoPane "Kualitas": judge milik draft section ini, bukan skor bab.
      judgeResult: run.judgeResult,
      latencySec: run.latencySec,
      model: run.model,
      // Hasil tahap checklist (worker.py::_SYSTEM_CHECKLIST): butir fakta yang dicari retrieval untuk section ini.
      checklist: Array.isArray(run.checklist) ? run.checklist.filter((v) => typeof v === 'string') : [],
      checklistError: run.checklistError,
    };
  }

  /**
   * POST bab/:id/sections — tambah section manual, langsung di akhir daftar
   * SAUDARANYA (parentId sama). `dto.parentId` diisi → jadi sub-sub-bab
   * anak section itu (satu tingkat, harus section yang sudah ada & di bab
   * yang sama — sama seperti findFirst di updateSection/deleteSection).
   * Tanpa LLM/job.
   */
  async createSection(id: string, dto: { title: string; guidance: string; parentId?: string }) {
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    if (dto.parentId) {
      const parent = await this.prisma.chapterSection.findFirst({
        where: { id: dto.parentId, chapterId: id },
      });
      if (!parent) throw new NotFoundException('Section induk tidak ditemukan');
      if (parent.parentId) {
        throw new ForbiddenException('Section cuma boleh bersarang satu tingkat (sub-sub-bab)');
      }
    }

    const terakhir = await this.prisma.chapterSection.aggregate({
      where: { chapterId: id, parentId: dto.parentId ?? null },
      _max: { order: true },
    });

    return this.prisma.chapterSection.create({
      data: {
        chapterId: id,
        parentId: dto.parentId ?? null,
        order: (terakhir._max.order ?? 0) + 1,
        title: dto.title,
        guidance: dto.guidance,
        status: 'PENDING',
      },
    });
  }

  /**
   * PATCH bab/:id/sections/:sectionId — dua jalur berbeda lewat dto yang sama:
   * `title`/`guidance` berubah → topiknya ganti, konten lama basi, direset ke
   * PENDING. `content` diisi → autosave kanvas section-view
   * (`use-chapter-autosave.ts`), ditulis apa adanya jadi GENERATED, TANPA
   * mereset apa pun — dua kasus ini tidak pernah terjadi bersamaan dari UI
   * yang sama, tapi kalau keduanya ada `content` menang (jalur autosave
   * lebih sering terjadi, tidak boleh keok oleh reset).
   */
  async updateSection(
    id: string,
    sectionId: string,
    dto: {
      title?: string;
      guidance?: string;
      content?: Record<string, unknown>;
      tableSpec?: { id: string; caption: string; columns: string[] }[];
    },
  ) {
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    const section = await this.prisma.chapterSection.findFirst({ where: { id: sectionId, chapterId: id } });
    if (!section) {
      throw new NotFoundException('Section tidak ditemukan');
    }
    this.assertSectionEditable(section);

    const gantiTopik = dto.title !== undefined || dto.guidance !== undefined;
    const updated = await this.prisma.chapterSection.update({
      where: { id: sectionId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.guidance !== undefined ? { guidance: dto.guidance } : {}),
        ...(gantiTopik ? { status: 'PENDING', content: Prisma.DbNull, error: null } : {}),
        ...(dto.content !== undefined
          ? { status: 'GENERATED', content: dto.content as Prisma.InputJsonValue, generatedAt: new Date() }
          : {}),
        // Instruksi tabel -- jalur independen sama seperti `content`, ditulis
        // apa adanya, tidak mereset status/content narasi.
        ...(dto.tableSpec !== undefined ? { tableSpec: dto.tableSpec as unknown as Prisma.InputJsonValue } : {}),
      },
    });

    // ponytail: tulisan kanvas juga masuk ke DRAFT YANG SEDANG DIPILIH.
    // `findSections` menyajikan `activeCheckpoint.contentSnapshot` sebagai
    // `content`, jadi tanpa ini ketikan tersimpan ke `section.content` tapi
    // tidak pernah terbaca lagi -- tulisan seolah hilang tiap muat ulang.
    // `section.content` tetap ditulis di atas sebagai cermin untuk kompilasi
    // bab/skoring/ingestion LED yang masih membacanya.
    if (dto.content !== undefined) {
      if (section.activeCheckpointId) {
        await this.prisma.sectionDraft.update({
          where: { id: section.activeCheckpointId },
          data: { contentSnapshot: dto.content as Prisma.InputJsonValue },
        });
      } else {
        // ponytail: section yang belum punya draft -- ketikan pertama di kanvas
        // MEMBUAT Draft 1 dan langsung memilihnya. Tanpa ini ada keadaan ganjil
        // "kanvas berisi tapi Riwayat Draft kosong": tulisannya tidak dimiliki
        // versi mana pun, jadi tidak bisa dibandingkan atau dikembalikan.
        const { userId } = this.tenantContext.getOrThrow();
        const [user, terakhir] = await Promise.all([
          this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { fullName: true },
          }),
          this.prisma.sectionDraft.aggregate({
            where: { sectionId },
            _max: { version: true },
          }),
        ]);
        const draft = await this.prisma.sectionDraft.create({
          data: {
            sectionId,
            createdByUserId: userId,
            createdByName: user.fullName,
            version: (terakhir._max.version ?? 0) + 1,
            contentSnapshot: dto.content as Prisma.InputJsonValue,
            source: 'MANUAL',
          },
        });
        await this.prisma.chapterSection.update({
          where: { id: sectionId },
          data: { activeCheckpointId: draft.id },
        });
      }
    }

    if (dto.content !== undefined) await this.recompileChapterContent(id);
    return updated;
  }

  /** Locked section: nobody edits; awaiting review: PENYUSUN can't. */
  private assertSectionEditable(section: { locked: boolean; reviewSubmittedAt: Date | null }) {
    if (section.locked) {
      throw new ForbiddenException('Section ini sedang terkunci untuk direview');
    }
    if (this.tenantContext.getOrThrow().role === Role.PENYUSUN && section.reviewSubmittedAt) {
      throw new ForbiddenException('Section ini sedang menunggu review, tidak bisa diedit Penyusun');
    }
  }

  /** DELETE bab/:id/sections/:sectionId — hapus section manual. */
  async deleteSection(id: string, sectionId: string) {
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    const section = await this.prisma.chapterSection.findFirst({ where: { id: sectionId, chapterId: id } });
    if (!section) {
      throw new NotFoundException('Section tidak ditemukan');
    }
    this.assertSectionEditable(section);

    await this.prisma.chapterSection.delete({ where: { id: sectionId } });
    await this.recompileChapterContent(id);
  }

  /**
   * Gabung ulang semua section berstatus GENERATED jadi `DocumentChapter.
   * workingContent` — re-implementasi TS dari `worker.py::
   * _compile_chapter_from_sections` (Python), dipanggil dari sana tiap
   * section selesai di-generate LLM. Duplikasi disengaja: ini murni
   * penyambungan node ProseMirror, gak butuh panggil AI service. Beda dari Python: TIDAK
   * bikin `ChapterDraft` baru (autosave section bisa berjalan tiap
   * beberapa detik — checkpoint baru tiap ketikan akan membanjiri riwayat
   * draft), cuma menimpa `workingContent` langsung, sama seperti autosave
   * bab biasa (`PATCH bab/:id`) yang juga tidak pernah bikin checkpoint.
   */
  async recompileChapterContent(chapterId: string): Promise<void> {
    // Semua section (bukan cuma GENERATED) -- `order` sekarang bersaing per
    // parent, jadi urutan yang benar cuma didapat dengan menyusuri pohonnya
    // sendiri (top-level dulu, lalu anak tiap top-level), bukan satu
    // `orderBy` global.
    const all = await this.prisma.chapterSection.findMany({
      where: { chapterId },
      orderBy: { order: 'asc' },
    });
    const anakDari = new Map<string, typeof all>();
    for (const s of all) {
      if (!s.parentId) continue;
      anakDari.set(s.parentId, [...(anakDari.get(s.parentId) ?? []), s]);
    }

    const nodes: ProseNode[] = [];
    // Sama dengan worker.py::_compile_chapter_from_sections: sedalam apa pun (h2..h6), judul = marker + judul.
    const tulis = (section: (typeof all)[number], level: number) => {
      const isi = section.status === 'GENERATED' ? proseNodes(section.content) : [];
      if (isi.length > 0) {
        const judul =
          section.marker && section.title !== section.marker ? `${section.marker} ${section.title}` : section.title;
        nodes.push({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: judul }] }, ...isi);
      }
      for (const anak of anakDari.get(section.id) ?? []) tulis(anak, Math.min(level + 1, 6));
    };
    for (const top of all.filter((s) => !s.parentId)) tulis(top, 2);

    await this.prisma.documentChapter.update({
      where: { id: chapterId },
      data: {
        workingContent: { type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] } as Prisma.InputJsonValue,
      },
    });
  }

  /** Enqueues GENERASI_BAB — apps/ai's worker generate SATU section. `draftId` wins over `selectedEvidenceIds` when both are set. */
  async triggerGenerate(
    id: string,
    sectionId: string,
    prompt?: string,
    draftId?: string,
    selectedEvidenceIds?: string[],
  ) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    const section = await this.prisma.chapterSection.findFirst({ where: { id: sectionId, chapterId: id } });
    if (!section) {
      throw new NotFoundException('Section tidak ditemukan');
    }
    this.assertSectionEditable(section);
    if (draftId) {
      const draft = await this.prisma.chapterDraft.findFirst({ where: { id: draftId, chapterId: id } });
      if (!draft) throw new NotFoundException('Draft tidak ditemukan untuk bab ini');
    }
    if (selectedEvidenceIds?.length) {
      await this.findSelectableEvidence(selectedEvidenceIds, bab.document.studyProgramId);
    }

    return this.jobsService.enqueue(JobType.GENERASI_BAB, {
      babDokumenId: bab.id,
      sectionId,
      tenantId,
      createdByUserId: userId,
      ...(prompt ? { prompt } : {}),
      ...(draftId ? { draftId } : {}),
      ...(selectedEvidenceIds && selectedEvidenceIds.length > 0 ? { selectedEvidenceIds } : {}),
    });
  }

  /**
   * Memicu penilaian RAGAS atas SATU section (tombol di tab Kualitas AI). Dinilai: teks section
   * saat ini (termasuk suntingan) terhadap konteks & acuan dari generate terakhirnya -- karena itu
   * section harus pernah digenerate. `judge_result` run itu langsung ditandai `pending` supaya UI
   * menampilkan "sedang dinilai" sebelum worker mengambil job-nya, dan klik ganda ditolak.
   */
  async triggerEvaluasiRagas(id: string, sectionId: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    const section = await this.prisma.chapterSection.findFirst({ where: { id: sectionId, chapterId: id } });
    if (!section) throw new NotFoundException('Section tidak ditemukan');

    const run = await this.prisma.generationRun.findFirst({
      where: { sectionId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, judgeResult: true },
    });
    if (!run) {
      throw new ConflictException('Section ini belum pernah digenerate AI, jadi belum ada yang bisa dinilai');
    }
    if (!proseNodes(section.content).length) {
      throw new ConflictException('Section masih kosong, tidak ada teks yang bisa dinilai');
    }
    const judge = run.judgeResult as { pending?: boolean; startedAt?: string } | null;
    const mulai = judge?.pending && judge.startedAt ? Date.parse(judge.startedAt) : NaN;
    if (judge?.pending && !(Date.now() - mulai > PENILAIAN_RAGAS_BATAS_MS)) {
      throw new ConflictException('Penilaian untuk section ini sedang berjalan');
    }

    await this.prisma.generationRun.update({
      where: { id: run.id },
      data: {
        judgeResult: { pending: true, engine: 'ragas', startedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });
    return this.jobsService.enqueue(JobType.PENILAIAN_RAGAS, {
      babDokumenId: bab.id,
      sectionId,
      runId: run.id,
      tenantId,
      createdByUserId: userId,
    });
  }

  /** Enqueues REKOMENDASI_DOKUMEN — apps/ai's worker builds document_query/candidate folders + an empty draft checkpoint. `draftId` set = "Rekomendasikan Ulang" (reuse that empty draft). */
  async triggerRecommendDocuments(id: string, draftId?: string, sectionId?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    if (sectionId) {
      const section = await this.prisma.chapterSection.findFirst({ where: { id: sectionId, chapterId: id } });
      if (!section) throw new NotFoundException('Section tidak ditemukan');
    }

    return this.jobsService.enqueue(JobType.REKOMENDASI_DOKUMEN, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(draftId ? { draftId } : {}),
      ...(sectionId ? { sectionId } : {}),
    });
  }

  /**
   * GET bab/:id/recommendation. `draftId` given -> latest row for that draft
   * (any status, e.g. right after triggering, before it's confirmed).
   * Omitted -> the chapter's latest recommended-or-confirmed recommendation.
   */
  /**
   * `draftId` diisi: rekomendasi milik draft ITU PERSIS, status apapun —
   * dipakai begitu `recommend-documents` baru selesai, sebelum ada yang
   * dikonfirmasi, saat pemanggil sudah tahu persis draft kosong mana yang
   * baru dibuat (`babDraftId` dari hasil job).
   *
   * `draftId` kosong: rekomendasi terbaru milik BAB ini yang masih
   * DIREKOMENDASIKAN atau DIKONFIRMASI (dimas get_recommendation: status IN
   * recommended/confirmed) — tanpa DIREKOMENDASIKAN, hasil rekomendasi yang
   * belum dikonfirmasi hilang begitu halaman di-refresh —
   * lepas dari draft mana yang jadi checkpoint aktif sekarang. Worker.py
   * TIDAK mengisi draft kosong hasil rekomendasi in-place saat generate —
   * ia selalu membuat versi draft baru (baris 71 tracker mencatat ini
   * sebagai simplifikasi sengaja) — jadi begitu generate pertama sukses,
   * `activeCheckpointId` bab pindah ke draft BARU itu, sementara baris
   * DocumentRecommendation tetap menunjuk draft kosong LAMA. Mencocokkan ke
   * `activeCheckpointId` persis (perilaku lama) berarti rekomendasi yang
   * sudah dikonfirmasi "hilang" tepat setelah generate pertama berhasil —
   * lalu generate kedua berjalan tanpa `draftId`, jadi tanpa bukti dukung
   * sama sekali, walau penyusun sudah mengonfirmasinya sebelumnya.
   */
  async findRecommendation(id: string, draftId?: string, sectionId?: string) {
    await this.access.findOneScoped(id);
    // sectionId: rekomendasi milik section itu saja (dimas per section).
    const perSection = sectionId ? { chapterSectionId: sectionId } : {};

    if (draftId) {
      const draft = await this.prisma.chapterDraft.findFirst({
        where: { id: draftId, chapterId: id },
      });
      if (!draft) {
        throw new NotFoundException('Checkpoint tidak ditemukan');
      }
      return this.prisma.documentRecommendation.findFirst({
        where: { chapterDraftId: draftId, ...perSection },
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { order: 'asc' } } },
      });
    }

    return this.prisma.documentRecommendation.findFirst({
      where: {
        status: { in: [StatusRekomendasi.DIREKOMENDASIKAN, StatusRekomendasi.DIKONFIRMASI] },
        chapterDraft: { chapterId: id },
        ...perSection,
      },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * POST bab/:id/recommend-documents/confirm. Sets the recommendation
   * DIKONFIRMASI with the user's evidence selection, then kicks extraction
   * (INGESTION_BUKTI_DUKUNG) for whichever selected evidence hasn't been
   * processed yet — same payload shape bukti-dukung.service.ts uses on
   * upload — so the user doesn't have to wait for that separately.
   */
  /** Evidence usable by a chapter: this tenant's, owned by the chapter's prodi or tenant-wide (no prodi). */
  /**
   * PUT bab/:id/sections/:sectionId/evidence-selection -- simpan centang bukti
   * dukung section ini. Semantik REPLACE: daftar yang dikirim menggantikan yang
   * lama seutuhnya, jadi meng-uncheck benar-benar bertahan.
   *
   * Ditulis ke kolom sendiri, bukan ke evidence_chapter_links/evidence_draft_links
   * -- keduanya catatan historis append-only "apa yang dipakai generate ke-N",
   * dan menghapus barisnya berarti memalsukan riwayat.
   */
  async updateSectionEvidenceSelection(id: string, sectionId: string, evidenceIds: string[]) {
    const bab = await this.access.findOneScoped(id);
    const section = await this.prisma.chapterSection.findFirst({
      where: { id: sectionId, chapterId: id },
    });
    if (!section) {
      throw new NotFoundException('Section tidak ditemukan');
    }
    this.assertSectionEditable(section);

    // Gerbang yang sama dengan confirmRecommendation: id asing / lintas prodi ditolak.
    await this.findSelectableEvidence(evidenceIds, bab.document.studyProgramId);

    await this.prisma.chapterSection.update({
      where: { id: sectionId },
      data: { selectedEvidenceIds: [...new Set(evidenceIds)] as Prisma.InputJsonValue },
    });
    return { selectedEvidenceIds: [...new Set(evidenceIds)] };
  }

  private async findSelectableEvidence(ids: string[], studyProgramId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const unique = [...new Set(ids)];
    const evidences = await this.prisma.evidence.findMany({
      where: {
        id: { in: unique },
        tenantId,
        kind: EvidenceKind.BUKTI_DUKUNG,
        OR: [{ studyProgramId }, { studyProgramId: null }],
      },
    });
    if (evidences.length !== unique.length) {
      throw new NotFoundException('Salah satu bukti dukung yang dipilih tidak ditemukan');
    }
    return evidences;
  }

  async confirmRecommendation(id: string, dto: ConfirmRecommendationDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);

    // Not trusted blindly — must belong to this chapter's own draft history.
    const recommendation = await this.prisma.documentRecommendation.findFirst({
      where: { id: dto.recommendationId, chapterDraft: { chapterId: id } },
    });
    if (!recommendation) {
      throw new NotFoundException('Rekomendasi tidak ditemukan');
    }
    // dimas confirm_recommendation can be repeated: re-ticking documents re-confirms with the new selection.
    if (recommendation.status === StatusRekomendasi.DIGANTIKAN) {
      throw new ForbiddenException('Rekomendasi ini sudah digantikan');
    }

    const evidences = await this.findSelectableEvidence(dto.selectedEvidenceIds, bab.document.studyProgramId);

    // Satu DIKONFIRMASI per bagian: konfirmasi rekomendasi lain di section yang sama menggantikan
    // yang lama (kalau tidak, indeks unik per section menolaknya dengan P2002).
    await this.prisma.documentRecommendation.updateMany({
      where: {
        chapterDraftId: recommendation.chapterDraftId,
        chapterSectionId: recommendation.chapterSectionId,
        status: StatusRekomendasi.DIKONFIRMASI,
        id: { not: dto.recommendationId },
      },
      data: { status: StatusRekomendasi.DIGANTIKAN },
    });

    const updated = await this.prisma.documentRecommendation.update({
      where: { id: dto.recommendationId },
      data: {
        status: StatusRekomendasi.DIKONFIRMASI,
        selectedEvidenceIds: dto.selectedEvidenceIds as Prisma.InputJsonValue,
      },
    });

    const pending = evidences.filter((e) => e.extractionStatus === StatusEkstraksi.MENUNGGU);
    await Promise.all(
      pending.map((e) =>
        this.jobsService.enqueue(JobType.INGESTION_BUKTI_DUKUNG, {
          buktiDukungId: e.id,
          tenantId,
          fileUrl: e.fileUrl,
          tipeFile: e.fileType,
        }),
      ),
    );

    return updated;
  }

  /** Enqueues SIMULASI_SKOR — no babDraftId means score the active content. */
  async triggerSimulateScore(id: string, babDraftId?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    if (babDraftId) {
      const draft = await this.prisma.chapterDraft.findFirst({
        where: { id: babDraftId, chapterId: id },
      });
      if (!draft) {
        throw new NotFoundException('Checkpoint tidak ditemukan');
      }
    }

    return this.jobsService.enqueue(JobType.SIMULASI_SKOR, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(babDraftId ? { babDraftId } : {}),
    });
  }

  /** Tenant/scope check for the chat proxy — per-section (dimas parity), same rules as everything else. */
  async assertSectionChatAccess(sectionId: string): Promise<{ userId: string }> {
    const { userId } = this.tenantContext.getOrThrow();
    await this.access.findSectionScoped(sectionId);
    return { userId };
  }
}
