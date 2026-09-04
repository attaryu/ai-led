import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { CreateBabDokumenDto } from './dto/create-bab-dokumen.dto';
import { UpdateBabDokumenDto } from './dto/update-bab-dokumen.dto';

@Injectable()
export class BabDokumenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly access: BabAccessService,
  ) {}

  async create(dokumenId: string, dto: CreateBabDokumenDto) {
    await this.access.findDokumenScoped(dokumenId);
    try {
      return await this.prisma.documentChapter.create({
        data: {
          documentId: dokumenId,
          chapterOrder: dto.chapterOrder,
          chapterTitle: dto.chapterTitle,
          workingContent: {},
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Urutan bab ini sudah ada pada dokumen tersebut');
      }
      throw err;
    }
  }

  async findAllForDokumen(dokumenId: string) {
    await this.access.findDokumenScoped(dokumenId);
    return this.prisma.documentChapter.findMany({
      where: { documentId: dokumenId },
      orderBy: { chapterOrder: 'asc' },
    });
  }

  /** Lintas prodi — Dashboard Utama KPI. */
  async findAllForTenant() {
    const { tenantId, role, studyProgramId } = this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && !studyProgramId) return [];

    return this.prisma.documentChapter.findMany({
      where: {
        document: {
          studyProgram: { tenantId },
          ...(role === Role.PENYUSUN ? { studyProgramId: studyProgramId ?? undefined } : {}),
        },
      },
    });
  }

  /** Includes buktiDukungBab/ragasScores/hasilSkorKriteria — access.findOneScoped skips these, most callers don't need them. */
  async findOne(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const bab = await this.prisma.documentChapter.findFirst({
      where: { id, document: { studyProgram: { tenantId } } },
      include: {
        document: { select: { studyProgramId: true } },
        buktiDukungBab: true,
        ragasScores: { orderBy: { computedAt: 'desc' }, take: 1 },
        hasilSkorKriteria: { where: { targetType: 'BAB_AKTIF' } },
      },
    });
    if (!bab) {
      throw new NotFoundException('Bab dokumen tidak ditemukan');
    }
    this.access.assertProgramStudiScope(bab.document.studyProgramId);

    const { document, ...rest } = bab;
    void document;
    return rest;
  }

  /** Content edit (chapterTitle/workingContent) — the autosave path. */
  async update(id: string, dto: UpdateBabDokumenDto) {
    const { role } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);

    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    if (role === Role.PENYUSUN && bab.reviewSubmittedAt) {
      throw new ForbiddenException(
        'Bab ini sedang menunggu review, tidak bisa diedit Penyusun',
      );
    }

    return this.prisma.documentChapter.update({
      where: { id },
      data: {
        ...dto,
        workingContent: dto.workingContent as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string) {
    const bab = await this.access.findOneScoped(id);
    if (bab.locked) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    try {
      await this.prisma.documentChapter.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'Bab ini masih punya data terkait (checkpoint/skor/riwayat chat) dan tidak bisa dihapus',
        );
      }
      throw err;
    }
  }
}
