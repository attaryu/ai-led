import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { ReviewStatusDto } from './dto/review-status.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

/** PENYUSUN submit-for-review / PENJAMIN_MUTU lock+review-note workflow. */
@Injectable()
export class BabReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly access: BabAccessService,
  ) {}

  /** PENYUSUN-only: mark ready for review, or cancel it (dto.diajukan = false). */
  async submitForReview(id: string, dto: SubmitReviewDto = {}) {
    const diajukan = dto.diajukan ?? true;
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    if (diajukan && bab.reviewSubmittedAt) {
      throw new ConflictException('Bab ini sudah diajukan untuk review');
    }
    if (!diajukan && !bab.reviewSubmittedAt) {
      throw new ConflictException('Bab ini belum diajukan untuk review');
    }
    return this.prisma.documentChapter.update({
      where: { id },
      data: { reviewSubmittedAt: diajukan ? new Date() : null },
    });
  }

  /** PENJAMIN_MUTU-only: lock/unlock and/or write a review note; either action clears reviewSubmittedAt. */
  async setReviewStatus(id: string, dto: ReviewStatusDto) {
    const { userId } = this.tenantContext.getOrThrow();
    await this.access.findOneScoped(id);

    const data: Prisma.DocumentChapterUpdateInput = { reviewSubmittedAt: null };

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

    return this.prisma.documentChapter.update({ where: { id }, data });
  }
}
