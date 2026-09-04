import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobType, Prisma, StatusEkstraksi, StatusRekomendasi } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { ConfirmRecommendationDto } from './dto/confirm-recommendation.dto';

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

  /** GET bab/:id/sections — daftar outline section, terurut. */
  async findSections(id: string) {
    await this.access.findOneScoped(id);
    return this.prisma.chapterSection.findMany({ where: { chapterId: id }, orderBy: { order: 'asc' } });
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
    dto: { title?: string; guidance?: string; content?: Record<string, unknown> },
  ) {
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    const section = await this.prisma.chapterSection.findFirst({ where: { id: sectionId, chapterId: id } });
    if (!section) {
      throw new NotFoundException('Section tidak ditemukan');
    }

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
      },
    });

    if (dto.content !== undefined) await this.recompileChapterContent(id);
    return updated;
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

    await this.prisma.chapterSection.delete({ where: { id: sectionId } });
    await this.recompileChapterContent(id);
  }

  /**
   * Gabung ulang semua section berstatus GENERATED jadi `DocumentChapter.
   * workingContent` — re-implementasi TS dari `worker.py::
   * _compile_chapter_from_sections` (Python), dipanggil dari sana tiap
   * section selesai di-generate LLM. Duplikasi disengaja: ini murni
   * string-concat, gak butuh panggil AI service. Beda dari Python: TIDAK
   * bikin `ChapterDraft` baru (autosave section bisa berjalan tiap
   * beberapa detik — checkpoint baru tiap ketikan akan membanjiri riwayat
   * draft), cuma menimpa `workingContent` langsung, sama seperti autosave
   * bab biasa (`PATCH bab/:id`) yang juga tidak pernah bikin checkpoint.
   */
  private async recompileChapterContent(chapterId: string): Promise<void> {
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

    let body = '';
    let markdown = '';
    const tulis = (section: (typeof all)[number], level: 2 | 3) => {
      const content = section.content as { body?: string; markdown?: string } | null;
      if (section.status === 'GENERATED' && content?.body) {
        body += `<h${level}>${section.title}</h${level}>${content.body}`;
        markdown += `${'#'.repeat(level)} ${section.title}\n\n${content.markdown ?? content.body}\n\n`;
      }
      for (const anak of anakDari.get(section.id) ?? []) tulis(anak, 3);
    };
    for (const top of all.filter((s) => !s.parentId)) tulis(top, 2);

    await this.prisma.documentChapter.update({
      where: { id: chapterId },
      data: { workingContent: { format: 'html', body, markdown } as Prisma.InputJsonValue },
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

  /** Enqueues REKOMENDASI_DOKUMEN — apps/ai's worker builds document_query/candidate folders + an empty draft checkpoint. `draftId` set = "Rekomendasikan Ulang" (reuse that empty draft). */
  async triggerRecommendDocuments(id: string, draftId?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    return this.jobsService.enqueue(JobType.REKOMENDASI_DOKUMEN, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(draftId ? { draftId } : {}),
    });
  }

  /**
   * GET bab/:id/recommendation. `draftId` given -> latest row for that draft
   * (any status, e.g. right after triggering, before it's confirmed).
   * Omitted -> the chapter's active checkpoint's confirmed recommendation.
   */
  /**
   * `draftId` diisi: rekomendasi milik draft ITU PERSIS, status apapun —
   * dipakai begitu `recommend-documents` baru selesai, sebelum ada yang
   * dikonfirmasi, saat pemanggil sudah tahu persis draft kosong mana yang
   * baru dibuat (`babDraftId` dari hasil job).
   *
   * `draftId` kosong: rekomendasi DIKONFIRMASI terbaru milik BAB ini —
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
  async findRecommendation(id: string, draftId?: string) {
    await this.access.findOneScoped(id);

    if (draftId) {
      const draft = await this.prisma.chapterDraft.findFirst({
        where: { id: draftId, chapterId: id },
      });
      if (!draft) {
        throw new NotFoundException('Checkpoint tidak ditemukan');
      }
      return this.prisma.documentRecommendation.findFirst({
        where: { chapterDraftId: draftId },
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { order: 'asc' } } },
      });
    }

    return this.prisma.documentRecommendation.findFirst({
      where: {
        status: StatusRekomendasi.DIKONFIRMASI,
        chapterDraft: { chapterId: id },
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
  async confirmRecommendation(id: string, dto: ConfirmRecommendationDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.access.findOneScoped(id);

    // Not trusted blindly — must belong to this chapter's own draft history.
    const recommendation = await this.prisma.documentRecommendation.findFirst({
      where: { id: dto.recommendationId, chapterDraft: { chapterId: id } },
    });
    if (!recommendation) {
      throw new NotFoundException('Rekomendasi tidak ditemukan');
    }
    if (recommendation.status !== StatusRekomendasi.DIREKOMENDASIKAN) {
      throw new ForbiddenException('Rekomendasi ini sudah dikonfirmasi atau digantikan');
    }

    const evidences = await this.prisma.evidence.findMany({
      where: { id: { in: dto.selectedEvidenceIds }, tenantId },
    });
    if (evidences.length !== dto.selectedEvidenceIds.length) {
      throw new NotFoundException('Salah satu bukti dukung yang dipilih tidak ditemukan');
    }

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

  /** Tenant/scope check for the chat proxy — same rules as everything else. */
  async assertChatAccess(id: string): Promise<{ userId: string }> {
    const { userId } = this.tenantContext.getOrThrow();
    await this.access.findOneScoped(id);
    return { userId };
  }
}
