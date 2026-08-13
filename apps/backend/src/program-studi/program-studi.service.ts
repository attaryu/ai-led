import { Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.programStudi.create({ data: { ...dto, tenantId } });
  }

  findAll() {
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.programStudi.findMany({
      where: { tenantId },
      orderBy: { dibuatPada: 'desc' },
    });
  }

  async findOne(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const programStudi = await this.prisma.programStudi.findFirst({
      where: { id, tenantId },
    });
    if (!programStudi) {
      throw new NotFoundException('Program studi tidak ditemukan');
    }
    return programStudi;
  }

  async update(id: string, dto: UpdateProgramStudiDto) {
    await this.findOne(id);
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.programStudi.update({
      where: { id, tenantId },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const { tenantId } = this.tenantContext.getOrThrow();
    await this.prisma.programStudi.delete({ where: { id, tenantId } });
  }
}
