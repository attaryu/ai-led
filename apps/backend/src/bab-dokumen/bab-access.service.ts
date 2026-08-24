import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

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
      select: { id: true, studyProgramId: true },
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
      include: { document: { select: { studyProgramId: true } } },
    });
    if (!bab) {
      throw new NotFoundException('Bab dokumen tidak ditemukan');
    }
    this.assertProgramStudiScope(bab.document.studyProgramId);
    return bab;
  }
}
