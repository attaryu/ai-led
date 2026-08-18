import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '@ai-led/db';
import { toSafeUser } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { ProgramStudiService } from '../program-studi/program-studi.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly programStudi: ProgramStudiService,
  ) {}

  /** Admin membuat PIMPINAN/PENJAMIN_MUTU/PENYUSUN; tenantId selalu dari token. */
  async create(dto: CreateUserDto) {
    // Penyusun tanpa prodi tidak punya satu pun halaman yang boleh ia buka.
    if (dto.role === Role.PENYUSUN && !dto.programStudiId) {
      throw new BadRequestException(
        'Penyusun harus ditugaskan ke satu program studi',
      );
    }

    if (dto.programStudiId) {
      // Melempar 404 sendiri bila prodinya bukan milik tenant ini.
      await this.programStudi.findOne(dto.programStudiId);
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const { tenantId } = this.tenantContext.getOrThrow();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        namaLengkap: dto.namaLengkap,
        email: dto.email,
        passwordHash,
        role: dto.role,
        programStudiId: dto.programStudiId ?? null,
      },
    });

    return toSafeUser(user);
  }

  /** Pimpinan memindahkan seorang Penyusun ke prodi lain. */
  async move(id: string, dto: UpdateUserDto) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.role !== Role.PENYUSUN) {
      throw new ConflictException(
        'Hanya Penyusun yang punya prodi untuk dipindahkan',
      );
    }

    // Melempar 404 sendiri bila prodinya bukan milik tenant ini.
    await this.programStudi.findOne(dto.programStudiId);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { programStudiId: dto.programStudiId },
    });
    return toSafeUser(updated);
  }
}
