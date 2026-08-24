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
    if (bab.terkunci) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    if (diajukan && bab.diajukanReviewPada) {
      throw new ConflictException('Bab ini sudah diajukan untuk review');
    }
    if (!diajukan && !bab.diajukanReviewPada) {
      throw new ConflictException('Bab ini belum diajukan untuk review');
    }
    return this.prisma.babDokumen.update({
      where: { id },
      data: { diajukanReviewPada: diajukan ? new Date() : null },
    });
  }

  /** PENJAMIN_MUTU-only: lock/unlock and/or write a review note; either action clears diajukanReviewPada. */
  async setReviewStatus(id: string, dto: ReviewStatusDto) {
    const { userId } = this.tenantContext.getOrThrow();
    await this.access.findOneScoped(id);

    const data: Prisma.BabDokumenUpdateInput = { diajukanReviewPada: null };

    if (dto.terkunci !== undefined) {
      data.terkunci = dto.terkunci;
    }

    if (dto.catatanPenjaminMutu !== undefined) {
      if (dto.catatanPenjaminMutu === null) {
        data.catatanPenjaminMutu = null;
        data.catatanOlehNama = null;
        data.catatanPada = null;
      } else {
        const user = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { fullName: true },
        });
        data.catatanPenjaminMutu = dto.catatanPenjaminMutu;
        data.catatanOlehNama = user.fullName;
        data.catatanPada = new Date();
      }
    }

    return this.prisma.babDokumen.update({ where: { id }, data });
  }
}
