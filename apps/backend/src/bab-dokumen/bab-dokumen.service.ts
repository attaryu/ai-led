import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobType, Prisma, Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateBabDokumenDto } from './dto/create-bab-dokumen.dto';
import { CreateBabDraftDto } from './dto/create-bab-draft.dto';
import { UpdateBabDokumenDto } from './dto/update-bab-dokumen.dto';
import { ReviewStatusDto } from './dto/review-status.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

@Injectable()
export class BabDokumenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly jobsService: JobsService,
  ) {}

  private assertProgramStudiScope(studyProgramId: string): void {
    const { role, studyProgramId: assignedId } =
      this.tenantContext.getOrThrow();
    if (role === Role.PENYUSUN && assignedId !== studyProgramId) {
      throw new ForbiddenException(
        'Anda hanya bisa mengakses program studi tempat Anda ditugaskan',
      );
    }
  }

  private async findDokumenScoped(dokumenId: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const dokumen = await this.prisma.dokumenLed.findFirst({
      where: { id: dokumenId, studyProgram: { tenantId } },
      select: { id: true, studyProgramId: true },
    });
    if (!dokumen) {
      throw new NotFoundException('Dokumen LED tidak ditemukan');
    }
    this.assertProgramStudiScope(dokumen.studyProgramId);
    return dokumen;
  }

  private async findOneScoped(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const bab = await this.prisma.babDokumen.findFirst({
      where: { id, dokumen: { studyProgram: { tenantId } } },
      include: { dokumen: { select: { studyProgramId: true } } },
    });
    if (!bab) {
      throw new NotFoundException('Bab dokumen tidak ditemukan');
    }
    this.assertProgramStudiScope(bab.dokumen.studyProgramId);
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

  /** Lintas prodi — Dashboard Utama KPI, mirrors DokumenLedService.findAllForTenant. */
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

  /**
   * `buktiDukungBab`/`ragasScores`/`hasilSkorKriteria` (semuanya lingkup
   * BAB_AKTIF) di-include di sini, bukan di `findOneScoped` — method itu
   * dipakai tiap pengecekan izin di bawah, dan sebagian besar pemanggilnya
   * (`update`, `triggerGenerate`, dst.) tidak pernah membaca ketiganya.
   */
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
    this.assertProgramStudiScope(bab.dokumen.studyProgramId);

    const { dokumen, ...rest } = bab;
    void dokumen;
    return rest;
  }

  /** Riwayat checkpoint bab ini — tab Draft/Rujukan/Kualitas AI/Rubrik. */
  async findDrafts(id: string) {
    await this.findOneScoped(id);
    return this.prisma.babDraft.findMany({
      where: { babId: id },
      orderBy: { versi: 'desc' },
      include: {
        buktiDukungDraft: true,
        ragasScores: true,
        hasilSkorKriteria: true,
      },
    });
  }

  /**
   * Checkpoint manual — tombol "Simpan Draft" tab Draft Editor Bab (§8.1).
   * `versi` dan `buktiDukungDraft` disalin dari kondisi bab saat ini.
   *
   * ponytail: baca-lalu-tulis `versi`, bukan increment atomik — cukup untuk
   * satu Penyusun per bab yang jadi kasus normal; race dua klik simultan
   * gagal keras lewat `@@unique([babId, versi])`, bukan korup diam-diam.
   */
  async createDraft(id: string, dto: CreateBabDraftDto) {
    const { userId } = this.tenantContext.getOrThrow();
    const bab = await this.findOneScoped(id);

    const [user, buktiDukungBab, terakhir] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { fullName: true },
      }),
      this.prisma.buktiDukungBab.findMany({ where: { babDokumenId: id } }),
      this.prisma.babDraft.aggregate({
        where: { babId: id },
        _max: { versi: true },
      }),
    ]);

    return this.prisma.babDraft.create({
      data: {
        babId: id,
        dibuatOlehUserId: userId,
        dibuatOlehNama: user.fullName,
        versi: (terakhir._max.versi ?? 0) + 1,
        label: dto.label?.trim() || null,
        kontenSnapshot: bab.kontenKerja as Prisma.InputJsonValue,
        sumber: 'MANUAL',
        buktiDukungDraft: {
          create: buktiDukungBab.map((row) => ({
            buktiDukungId: row.buktiDukungId,
            namaDokumen: row.namaDokumen,
            tipeFile: row.tipeFile,
          })),
        },
      },
      include: { buktiDukungDraft: true, ragasScores: true, hasilSkorKriteria: true },
    });
  }

  /**
   * Kriteria rubrik LAM Teknik yang menilai bab ini, dicocokkan lewat
   * `urutanBab` — bukan FK ke `BabDokumen.id` (database.md §11).
   */
  async findRubrik(id: string) {
    const bab = await this.findOneScoped(id);
    const rows = await this.prisma.rubrikKriteriaBab.findMany({
      where: { urutanBab: bab.urutanBab },
      include: { kriteria: { include: { level: { orderBy: { skor: 'desc' } } } } },
    });
    return rows.map((row) => row.kriteria);
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

  /** Enqueues GENERASI_BAB — apps/ai's worker does the actual RAG pipeline. */
  async triggerGenerate(id: string, prompt?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.findOneScoped(id);
    if (bab.terkunci) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    return this.jobsService.enqueue(JobType.GENERASI_BAB, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(prompt ? { prompt } : {}),
    });
  }

  /**
   * Enqueues SIMULASI_SKOR — worker menilai isi bab (atau salah satu
   * checkpoint-nya) terhadap kriteria rubrik LAM Teknik. Tanpa `babDraftId`
   * berarti menilai kondisi aktif.
   */
  async triggerSimulateScore(id: string, babDraftId?: string) {
    const { tenantId, userId } = this.tenantContext.getOrThrow();
    const bab = await this.findOneScoped(id);
    if (bab.terkunci) {
      throw new ForbiddenException('Bab ini sedang terkunci untuk direview');
    }

    if (babDraftId) {
      const draft = await this.prisma.babDraft.findFirst({
        where: { id: babDraftId, babId: id },
      });
      if (!draft) {
        throw new NotFoundException('Checkpoint tidak ditemukan');
      }
    }

    return this.jobsService.enqueue(JobType.SIMULASI_SKOR, {
      babDokumenId: bab.id,
      tenantId,
      createdByUserId: userId,
      ...(babDraftId ? { babDraftId } : {}),
    });
  }

  /** Tenant/scope check for the chat proxy — same rules as everything else. */
  async assertChatAccess(id: string): Promise<{ userId: string }> {
    const { userId } = this.tenantContext.getOrThrow();
    await this.findOneScoped(id);
    return { userId };
  }

  /** PENYUSUN-only: mark ready for review, or cancel it (dto.diajukan = false). */
  async submitForReview(id: string, dto: SubmitReviewDto = {}) {
    const diajukan = dto.diajukan ?? true;
    const bab = await this.findOneScoped(id);
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
          select: { fullName: true },
        });
        data.catatanPenjaminMutu = dto.catatanPenjaminMutu;
        data.catatanOlehNama = user.fullName;
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
