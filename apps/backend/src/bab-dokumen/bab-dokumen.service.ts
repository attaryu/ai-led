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
      return await this.prisma.babDokumen.create({
        data: {
          dokumenId,
          urutanBab: dto.urutanBab,
          judulBab: dto.judulBab,
          kontenKerja: {},
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
    return this.prisma.babDokumen.findMany({
      where: { dokumenId },
      orderBy: { urutanBab: 'asc' },
    });
  }

  /** Lintas prodi — Dashboard Utama KPI. */
  async findAllForTenant() {
    const { tenantId, role, studyProgramId } = this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && !studyProgramId) return [];

    return this.prisma.babDokumen.findMany({
      where: {
        dokumen: {
          studyProgram: { tenantId },
          ...(role === Role.PENYUSUN ? { studyProgramId: studyProgramId ?? undefined } : {}),
        },
      },
    });
  }

  /** Includes buktiDukungBab/ragasScores/hasilSkorKriteria — access.findOneScoped skips these, most callers don't need them. */
  async findOne(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const bab = await this.prisma.babDokumen.findFirst({
      where: { id, dokumen: { studyProgram: { tenantId } } },
      include: {
        dokumen: { select: { studyProgramId: true } },
        buktiDukungBab: true,
        ragasScores: { orderBy: { dihitungPada: 'desc' }, take: 1 },
        hasilSkorKriteria: { where: { targetTipe: 'BAB_AKTIF' } },
      },
    });
    if (!bab) {
      throw new NotFoundException('Bab dokumen tidak ditemukan');
    }
    this.access.assertProgramStudiScope(bab.dokumen.studyProgramId);

    const { dokumen, ...rest } = bab;
    void dokumen;
    return rest;
  }

  /** Content edit (judulBab/kontenKerja) — the autosave path. */
  async update(id: string, dto: UpdateBabDokumenDto) {
    const { role } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);

    if (bab.terkunci) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    if (role === Role.PENYUSUN && bab.diajukanReviewPada) {
      throw new ForbiddenException(
        'Bab ini sedang menunggu review, tidak bisa diedit Penyusun',
      );
    }

    return this.prisma.babDokumen.update({
      where: { id },
      data: {
        ...dto,
        kontenKerja: dto.kontenKerja as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string) {
    const bab = await this.access.findOneScoped(id);
    if (bab.terkunci) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    try {
      await this.prisma.babDokumen.delete({ where: { id } });
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
