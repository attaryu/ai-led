import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role } from '@ai-led/db';
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
    if (dto.role === Role.PENYUSUN && !dto.studyProgramId) {
      throw new BadRequestException(
        'Penyusun harus ditugaskan ke satu program studi',
      );
    }

    if (dto.studyProgramId) {
      // Melempar 404 sendiri bila prodinya bukan milik tenant ini.
      await this.programStudi.findOne(dto.studyProgramId);
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
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        role: dto.role,
        studyProgramId: dto.studyProgramId ?? null,
      },
    });

    return toSafeUser(user);
  }

  /** Admin + Pimpinan — daftar untuk halaman Manajemen Pengguna. */
  findAll() {
    const { tenantId } = this.tenantContext.getOrThrow();
    return this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { studyProgram: { select: { name: true } } },
    });
  }

  /** PIMPINAN may only move a Penyusun to another prodi (§4.2); ADMIN can edit the full profile. */
  async update(id: string, dto: UpdateUserDto) {
    const { tenantId, role: callerRole } = this.tenantContext.getOrThrow();
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    if (callerRole === Role.PIMPINAN) {
      return this.moveAsPimpinan(user, dto);
    }
    return this.updateAsAdmin(user, dto);
  }

  private async moveAsPimpinan(
    user: { id: string; role: Role },
    dto: UpdateUserDto,
  ) {
    const { fullName, email, password, role, studyProgramId } = dto;
    const adaFieldTerlarang =
      fullName !== undefined ||
      email !== undefined ||
      password !== undefined ||
      role !== undefined;
    if (adaFieldTerlarang) {
      throw new ForbiddenException(
        'Pimpinan hanya boleh memindahkan Penyusun ke prodi lain',
      );
    }
    if (user.role !== Role.PENYUSUN) {
      throw new ConflictException(
        'Hanya Penyusun yang punya prodi untuk dipindahkan',
      );
    }
    if (!studyProgramId) {
      throw new BadRequestException('studyProgramId wajib diisi');
    }

    // Melempar 404 sendiri bila prodinya bukan milik tenant ini.
    await this.programStudi.findOne(studyProgramId);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { studyProgramId },
    });
    return toSafeUser(updated);
  }

  private async updateAsAdmin(
    user: { id: string; role: Role; studyProgramId: string | null },
    dto: UpdateUserDto,
  ) {
    const data: Prisma.UserUncheckedUpdateInput = {};

    if (dto.fullName !== undefined) data.fullName = dto.fullName;

    if (dto.email !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== user.id) {
        throw new ConflictException('Email sudah terdaftar');
      }
      data.email = dto.email;
    }

    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.role !== undefined) data.role = dto.role;

    const nextRole = dto.role ?? user.role;
    const nextStudyProgramId =
      dto.studyProgramId !== undefined ? dto.studyProgramId : user.studyProgramId;

    if (nextRole === Role.PENYUSUN && !nextStudyProgramId) {
      throw new BadRequestException(
        'Penyusun harus ditugaskan ke satu program studi',
      );
    }
    if (nextRole !== Role.PENYUSUN) {
      // Other roles don't have a prodi (docs/database.md §2).
      data.studyProgramId = null;
    } else if (dto.studyProgramId !== undefined) {
      await this.programStudi.findOne(dto.studyProgramId);
      data.studyProgramId = dto.studyProgramId;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
    });
    return toSafeUser(updated);
  }

  /** Admin-only. Gagal dengan pesan jelas kalau user masih punya data terkait (draft/bukti dukung/dst). */
  async remove(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'User ini masih punya data terkait (checkpoint/bukti dukung/dst.) dan tidak bisa dihapus',
        );
      }
      throw err;
    }
  }
}
