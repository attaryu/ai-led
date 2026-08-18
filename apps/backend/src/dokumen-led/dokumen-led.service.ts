import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StatusDokumen } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateDokumenLedDto } from './dto/create-dokumen-led.dto';
import { UpdateDokumenLedDto } from './dto/update-dokumen-led.dto';

@Injectable()
export class DokumenLedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // PENYUSUN is scoped to the single program studi they're assigned to;
  // every other role operates tenant-wide.
  private assertProgramStudiScope(programStudiId: string): void {
    const { role, programStudiId: assignedId } =
      this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && assignedId !== programStudiId) {
      throw new ForbiddenException(
        'Anda hanya bisa mengakses program studi tempat Anda ditugaskan',
      );
    }
  }

  private async assertProgramStudiInTenant(
    programStudiId: string,
  ): Promise<void> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const programStudi = await this.prisma.programStudi.findFirst({
      where: { id: programStudiId, tenantId },
      select: { id: true },
    });
    if (!programStudi) {
      throw new NotFoundException('Program studi tidak ditemukan');
    }
    this.assertProgramStudiScope(programStudiId);
  }

  async create(programStudiId: string, dto: CreateDokumenLedDto) {
    await this.assertProgramStudiInTenant(programStudiId);
    return this.prisma.dokumenLed.create({
      data: { ...dto, programStudiId, statusKeseluruhan: StatusDokumen.DRAFT },
    });
  }

  async findAllForProgramStudi(programStudiId: string) {
    await this.assertProgramStudiInTenant(programStudiId);
    return this.prisma.dokumenLed.findMany({
      where: { programStudiId },
      orderBy: { dibuatPada: 'desc' },
    });
  }

  /** Seluruh Dokumen LED tenant lintas prodi, satu query (bukan 1+N). */
  async findAllForTenant() {
    const { tenantId, role, programStudiId } = this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && !programStudiId) return [];

    return this.prisma.dokumenLed.findMany({
      where: {
        programStudi: { tenantId },
        ...(role === Role.PENYUSUN ? { programStudiId: programStudiId ?? undefined } : {}),
      },
      orderBy: { dibuatPada: 'desc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const dokumen = await this.prisma.dokumenLed.findFirst({
      where: { id, programStudi: { tenantId } },
    });
    if (!dokumen) {
      throw new NotFoundException('Dokumen LED tidak ditemukan');
    }
    this.assertProgramStudiScope(dokumen.programStudiId);
    return dokumen;
  }

  async update(id: string, dto: UpdateDokumenLedDto) {
    await this.findOne(id);
    return this.prisma.dokumenLed.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.dokumenLed.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Dokumen LED ini masih punya bab — hapus seluruh babnya terlebih dahulu',
        );
      }
      throw err;
    }
  }
}
