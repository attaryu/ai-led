import { Injectable } from '@nestjs/common';
import { Prisma } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { CreateBabDraftDto } from './dto/create-bab-draft.dto';

/** Checkpoint/draft history and rubric lookup for one bab (tab Draft/Rubrik). */
@Injectable()
export class BabDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly access: BabAccessService,
  ) {}

  /** Riwayat checkpoint — tab Draft/Rujukan/Kualitas AI/Rubrik. */
  async findDrafts(id: string) {
    await this.access.findOneScoped(id);
    return this.prisma.chapterDraft.findMany({
      where: { chapterId: id },
      orderBy: { version: 'desc' },
      include: { buktiDukungDraft: true, ragasScores: true, hasilSkorKriteria: true },
    });
  }

  /**
   * Manual checkpoint (tab Draft, §8.1).
   * ponytail: baca-lalu-tulis `version`, bukan increment atomik — race dua
   * klik simultan gagal keras via `@@unique([chapterId, version])`, bukan korup diam-diam.
   */
  async createDraft(id: string, dto: CreateBabDraftDto) {
    const { userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);

    const [user, buktiDukungBab, terakhir] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } }),
      this.prisma.evidenceChapterLink.findMany({ where: { chapterId: id } }),
      this.prisma.chapterDraft.aggregate({ where: { chapterId: id }, _max: { version: true } }),
    ]);

    return this.prisma.chapterDraft.create({
      data: {
        chapterId: id,
        createdByUserId: userId,
        createdByName: user.fullName,
        version: (terakhir._max.version ?? 0) + 1,
        label: dto.label?.trim() || null,
        contentSnapshot: bab.workingContent as Prisma.InputJsonValue,
        source: 'MANUAL',
        buktiDukungDraft: {
          create: buktiDukungBab.map((row) => ({
            evidenceId: row.evidenceId,
            documentName: row.documentName,
            fileType: row.fileType,
          })),
        },
      },
      include: { buktiDukungDraft: true, ragasScores: true, hasilSkorKriteria: true },
    });
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
