import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { ReviewStatusDto } from './dto/review-status.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

/** PENYUSUN submit-for-review / PENJAMIN_MUTU lock+review-note workflow -- per-section (dimas parity). */
@Injectable()
export class BabReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly access: BabAccessService,
  ) {}

  /** PENYUSUN-only: mark ready for review, or cancel it (dto.diajukan = false). */
  async submitForReview(sectionId: string, dto: SubmitReviewDto = {}) {
    const diajukan = dto.diajukan ?? true;
    const section = await this.access.findSectionScoped(sectionId);
    if (section.locked) {
      throw new ForbiddenException('Section ini sedang terkunci untuk direview');
    }
    if (diajukan && section.reviewSubmittedAt) {
      throw new ConflictException('Section ini sudah diajukan untuk review');
    }
    if (!diajukan && !section.reviewSubmittedAt) {
      throw new ConflictException('Section ini belum diajukan untuk review');
    }
    return this.prisma.chapterSection.update({
      where: { id: sectionId },
      data: { reviewSubmittedAt: diajukan ? new Date() : null },
    });
  }

  /** PENJAMIN_MUTU-only: lock/unlock and/or write a review note; either action clears reviewSubmittedAt. */
  async setReviewStatus(sectionId: string, dto: ReviewStatusDto) {
    const { userId } = this.tenantContext.getOrThrow();
    await this.access.findSectionScoped(sectionId);

    const data: Prisma.ChapterSectionUpdateInput = { reviewSubmittedAt: null };

    if (dto.locked !== undefined) {
      data.locked = dto.locked;
    }

    if (dto.qualityAssuranceNote !== undefined) {
      if (dto.qualityAssuranceNote === null) {
        data.qualityAssuranceNote = null;
        data.notedByName = null;
        data.notedAt = null;
      } else {
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { fullName: true },
        });
        data.qualityAssuranceNote = dto.qualityAssuranceNote;
        data.notedByName = user.fullName;
        data.notedAt = new Date();
      }
    }

    return this.prisma.chapterSection.update({ where: { id: sectionId }, data });
  }
}
