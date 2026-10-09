import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

/** Per-section review state; the chapter-level lock/submit flags are derived from it (nothing writes DocumentChapter.locked anymore). */
export const withSectionReviewSelect = { sections: { select: { locked: true, reviewSubmittedAt: true } } } as const;

/** locked = every section locked; reviewSubmittedAt = any section awaiting review. Chapters without sections keep their own flags. */
export function withSectionReview<
  T extends { locked: boolean; reviewSubmittedAt: Date | null; sections?: { locked: boolean; reviewSubmittedAt: Date | null }[] },
>(bab: T): Omit<T, 'sections'> {
  const { sections, ...rest } = bab;
  if (!sections?.length) return rest;
  return {
    ...rest,
    locked: sections.every((s) => s.locked),
    reviewSubmittedAt: sections.find((s) => s.reviewSubmittedAt)?.reviewSubmittedAt ?? null,
  };
}

/** Tenant/role scoping shared by every bab-dokumen sub-service. */
@Injectable()
export class BabAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  assertProgramStudiScope(studyProgramId: string): void {
    const { role, studyProgramId: assignedId } = this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && assignedId !== studyProgramId) {
      throw new ForbiddenException(
        'Anda hanya bisa mengakses program studi tempat Anda ditugaskan',
      );
    }
  }

  async findDokumenScoped(dokumenId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const dokumen = await this.prisma.ledDocument.findFirst({
      where: { id: dokumenId, studyProgram: { tenantId } },
      select: { id: true, studyProgramId: true, accreditationSetId: true },
    });
    if (!dokumen) {
      throw new NotFoundException('Dokumen LED tidak ditemukan');
    }
    this.assertProgramStudiScope(dokumen.studyProgramId);
    return dokumen;
  }

  async findOneScoped(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const bab = await this.prisma.documentChapter.findFirst({
      where: { id, document: { studyProgram: { tenantId } } },
      include: {
        document: { select: { studyProgramId: true, accreditationSetId: true } },
        ...withSectionReviewSelect,
      },
    });
    if (!bab) {
      throw new NotFoundException('Bab dokumen tidak ditemukan');
    }
    this.assertProgramStudiScope(bab.document.studyProgramId);
    return withSectionReview(bab);
  }

  /** Sama seperti findOneScoped tapi utk ChapterSection -- chat/draft/review sekarang di level ini, bukan bab. */
  async findSectionScoped(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const section = await this.prisma.chapterSection.findFirst({
      where: { id, chapter: { document: { studyProgram: { tenantId } } } },
      include: { chapter: { select: { id: true, document: { select: { studyProgramId: true } } } } },
    });
    if (!section) {
      throw new NotFoundException('Section tidak ditemukan');
    }
    this.assertProgramStudiScope(section.chapter.document.studyProgramId);
    return section;
  }
}
