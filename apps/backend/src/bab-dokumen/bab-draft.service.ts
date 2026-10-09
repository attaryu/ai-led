import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { CreateBabDraftDto } from './dto/create-bab-draft.dto';

/** Per-section checkpoint/draft history + bab-level rubric lookup. */
@Injectable()
export class BabDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly access: BabAccessService,
  ) {}

  /** Checkpoint AI bab (ChapterDraft, ditulis worker) -- tab Rujukan/Kualitas AI/Rubrik, read-only. */
  async findDrafts(id: string) {
    await this.access.findOneScoped(id);
    return this.prisma.chapterDraft.findMany({
      where: { chapterId: id },
      orderBy: { version: 'desc' },
      include: { buktiDukungDraft: true, ragasScores: true, hasilSkorKriteria: true },
    });
  }

  /** Riwayat checkpoint per-section (dimas parity) — tab Draft di editor section. */
  async findSectionDrafts(sectionId: string) {
    const section = await this.access.findSectionScoped(sectionId);
    const drafts = await this.prisma.sectionDraft.findMany({
      where: { sectionId },
      orderBy: { version: 'desc' },
    });
    // dimas badge "Aktif": versi yang sekarang jadi isi section (terakhir di-generate/dipulihkan).
    return drafts.map((d) => ({ ...d, isActive: d.id === section.activeCheckpointId }));
  }

  /** Manual checkpoint per-section -- baca-lalu-tulis version, race dua klik gagal keras via @@unique, bukan korup diam-diam. */
  async createSectionDraft(sectionId: string, dto: CreateBabDraftDto) {
    const { userId } = this.tenantContext.getOrThrow();
    const section = await this.access.findSectionScoped(sectionId);

    const [user, terakhir] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } }),
      this.prisma.sectionDraft.aggregate({ where: { sectionId }, _max: { version: true } }),
    ]);

    const draft = await this.prisma.sectionDraft.create({
      data: {
        sectionId,
        createdByUserId: userId,
        createdByName: user.fullName,
        version: (terakhir._max.version ?? 0) + 1,
        label: dto.label?.trim() || null,
        contentSnapshot: (section.content ?? {}) as Prisma.InputJsonValue,
        source: 'MANUAL',
      },
    });

    // ponytail: draft baru langsung jadi yang terpilih -- sama seperti jalur AI
    // (generation_client.py::create_section_draft_ai). Tanpa ini, menyimpan draft
    // menghasilkan baris baru yang TIDAK bertanda "Aktif", jadi tulisan yang
    // barusan disimpan seolah bukan milik draft mana pun.
    await this.prisma.chapterSection.update({
      where: { id: sectionId },
      data: { activeCheckpointId: draft.id },
    });

    return draft;
  }

  /** Pulihkan section ke isi salah satu checkpoint-nya sendiri -- draft yang bukan milik section ini ditolak 404, bukan disamarkan lewat query WHERE. */
  async restoreSectionDraft(sectionId: string, draftId: string) {
    await this.access.findSectionScoped(sectionId);

    const draft = await this.prisma.sectionDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.sectionId !== sectionId) {
      throw new NotFoundException('Checkpoint tidak ditemukan untuk section ini');
    }

    return this.prisma.chapterSection.update({
      where: { id: sectionId },
      data: { content: draft.contentSnapshot as Prisma.InputJsonValue, activeCheckpointId: draft.id },
    });
  }

  /**
   * Hapus satu checkpoint section. Kepemilikan dicek sama seperti
   * restoreSectionDraft -- draft milik section lain ditolak 404, bukan
   * disamarkan lewat query WHERE.
   *
   * Checkpoint yang sedang AKTIF boleh dihapus: FK
   * writing_chapter_sections.active_checkpoint_id ON DELETE SET NULL, jadi
   * section-nya cuma kehilangan penanda "Aktif". Isi tulisannya TIDAK ikut
   * hilang -- itu hidup di ChapterSection.content, snapshot ini hanya arsip.
   *
   * Nomor versi sengaja TIDAK dirapikan setelah hapus: createSectionDraft
   * memakai MAX(version)+1 (bukan COUNT+1), jadi lubang di urutan tidak
   * merusak apa pun, sementara menomori ulang akan mengubah arti label
   * "Versi N" yang sudah dilihat penyusun.
   */
  async deleteSectionDraft(sectionId: string, draftId: string) {
    const section = await this.access.findSectionScoped(sectionId);

    const draft = await this.prisma.sectionDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.sectionId !== sectionId) {
      throw new NotFoundException('Checkpoint tidak ditemukan untuk section ini');
    }

    await this.prisma.sectionDraft.delete({ where: { id: draftId } });

    // ponytail: draft adalah sumber narasi (findSections menyajikan
    // activeCheckpoint.contentSnapshot sebagai `content`), jadi menghapus draft
    // yang sedang dipilih harus ikut membereskan apa yang tampil di kanvas --
    // kalau tidak, tulisannya tetap terlihat padahal versinya sudah tidak ada.
    if (section.activeCheckpointId === draftId) {
      // Jatuh ke draft tersisa yang terbaru; tidak ada lagi -> kanvas dikosongkan.
      const pengganti = await this.prisma.sectionDraft.findFirst({
        where: { sectionId },
        orderBy: { version: 'desc' },
      });
      await this.prisma.chapterSection.update({
        where: { id: sectionId },
        data: pengganti
          ? {
              activeCheckpointId: pengganti.id,
              content: pengganti.contentSnapshot as Prisma.InputJsonValue,
            }
          : { activeCheckpointId: null, content: Prisma.DbNull, status: 'PENDING' },
      });
    }
  }

  /**
   * Kriteria rubrik dicocokkan lewat chapterOrder, bukan FK ke BabDokumen.id
   * (database.md §11) — DAN discope ke accreditationSetId dokumennya, karena
   * chapterOrder (angka kecil 1-4) berulang lintas set. Tanpa filter ini,
   * begitu ada >1 AccreditationSet, kriteria dari set lain ikut tercampur.
   * Dokumen yang belum memilih set (accreditationSetId null) belum punya
   * rubrik untuk ditampilkan sama sekali.
   */
  async findRubrik(id: string) {
    const bab = await this.access.findOneScoped(id);
    const accreditationSetId = bab.document.accreditationSetId;
    if (!accreditationSetId) return [];

    const rows = await this.prisma.rubricCriterionChapter.findMany({
      where: { chapterOrder: bab.chapterOrder, criterion: { accreditationSetId } },
      include: { criterion: { include: { levels: { orderBy: { score: 'desc' } } } } },
    });
    return rows.map((row) => row.criterion);
  }
}
