import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateProgramStudiDto } from './dto/create-program-studi.dto';
import { UpdateProgramStudiDto } from './dto/update-program-studi.dto';

@Injectable()
export class ProgramStudiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  create(dto: CreateProgramStudiDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.studyProgram.create({ data: { ...dto, tenantId } });
  }

  findAll() {
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.studyProgram.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const studyProgram = await this.prisma.studyProgram.findFirst({
      where: { id, tenantId },
    });
    if (!studyProgram) {
      throw new NotFoundException('Program studi tidak ditemukan');
    }
    return studyProgram;
  }

  async update(id: string, dto: UpdateProgramStudiDto) {
    await this.findOne(id);
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.studyProgram.update({
      where: { id, tenantId },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const { tenantId } = this.tenantContext.getOrThrow();

    // Dicek dulu supaya pesannya bisa menyebut jumlahnya; FK Restrict tetap
    // jadi penjaga terakhir kalau ada race.
    const penyusunCount = await this.prisma.user.count({
      where: { studyProgramId: id, role: Role.PENYUSUN },
    });
    if (penyusunCount > 0) {
      throw new ConflictException(
        `Program studi ini masih punya ${penyusunCount} Penyusun — pindahkan mereka ke prodi lain dulu sebelum menghapus`,
      );
    }

    try {
      await this.prisma.studyProgram.delete({ where: { id, tenantId } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Program studi ini masih punya Dokumen LED, user, atau bukti dukung terkait dan tidak bisa dihapus',
        );
      }
      throw err;
    }
  }
}
