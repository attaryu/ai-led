import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateBabDokumenDto } from './dto/create-bab-dokumen.dto';
import { UpdateBabDokumenDto } from './dto/update-bab-dokumen.dto';
import { ReviewStatusDto } from './dto/review-status.dto';

@Injectable()
export class BabDokumenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private assertProgramStudiScope(programStudiId: string): void {
    const { role, programStudiId: assignedId } =
      this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && assignedId !== programStudiId) {
      throw new ForbiddenException(
        'Anda hanya bisa mengakses program studi tempat Anda ditugaskan',
      );
    }
  }

  private async findDokumenScoped(dokumenId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const dokumen = await this.prisma.dokumenLed.findFirst({
      where: { id: dokumenId, programStudi: { tenantId } },
      select: { id: true, programStudiId: true },
    });
    if (!dokumen) {
      throw new NotFoundException('Dokumen LED tidak ditemukan');
    }
    this.assertProgramStudiScope(dokumen.programStudiId);
    return dokumen;
  }

  private async findOneScoped(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const bab = await this.prisma.babDokumen.findFirst({
      where: { id, dokumen: { programStudi: { tenantId } } },
      include: { dokumen: { select: { programStudiId: true } } },
    });
    if (!bab) {
      throw new NotFoundException('Bab dokumen tidak ditemukan');
    }
    this.assertProgramStudiScope(bab.dokumen.programStudiId);
    return bab;
  }

  async create(dokumenId: string, dto: CreateBabDokumenDto) {
    await this.findDokumenScoped(dokumenId);
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
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Urutan bab ini sudah ada pada dokumen tersebut',
        );
      }
      throw err;
    }
  }

  async findAllForDokumen(dokumenId: string) {
    await this.findDokumenScoped(dokumenId);
    return this.prisma.babDokumen.findMany({
      where: { dokumenId },
      orderBy: { urutanBab: 'asc' },
    });
  }

  async findOne(id: string) {
    const { dokumen, ...bab } = await this.findOneScoped(id);
    void dokumen;
    return bab;
  }

  /** Content edit (judulBab / kontenKerja) - the autosave path. */
  async update(id: string, dto: UpdateBabDokumenDto) {
    const { role } = this.tenantContext.getOrThrow();
    const bab = await this.findOneScoped(id);

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

  /** PENYUSUN-only: mark ready for review. Controller restricts the role. */
  async submitForReview(id: string) {
    const bab = await this.findOneScoped(id);
    if (bab.terkunci) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    if (bab.diajukanReviewPada) {
      throw new ConflictException('Bab ini sudah diajukan untuk review');
    }
    return this.prisma.babDokumen.update({
      where: { id },
      data: { diajukanReviewPada: new Date() },
    });
  }

  /**
   * PENJAMIN_MUTU-only: lock/unlock and/or write a review note. Controller
   * restricts the role. Either action clears diajukanReviewPada.
   */
  async setReviewStatus(id: string, dto: ReviewStatusDto) {
    const { userId } = this.tenantContext.getOrThrow();
    await this.findOneScoped(id);

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
          select: { namaLengkap: true },
        });
        data.catatanPenjaminMutu = dto.catatanPenjaminMutu;
        data.catatanOlehNama = user.namaLengkap;
        data.catatanPada = new Date();
      }
    }

    return this.prisma.babDokumen.update({ where: { id }, data });
  }

  async remove(id: string) {
    const bab = await this.findOneScoped(id);
    if (bab.terkunci) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }
    try {
      await this.prisma.babDokumen.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Bab ini masih punya data terkait (checkpoint/skor/riwayat chat) dan tidak bisa dihapus',
        );
      }
      throw err;
    }
  }
}
