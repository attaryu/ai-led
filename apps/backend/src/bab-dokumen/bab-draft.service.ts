import { Injectable } from '@nestjs/common';
import { Prisma } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { BabAccessService } from './bab-access.service';
import { CreateBabDraftDto } from './dto/create-bab-draft.dto';

/** Checkpoint/draft history and rubric lookup for one bab (tab Draft/Rubrik). */
@Injectable()
export class BabDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly access: BabAccessService,
  ) {}

  /** Riwayat checkpoint — tab Draft/Rujukan/Kualitas AI/Rubrik. */
  async findDrafts(id: string) {
    await this.access.findOneScoped(id);
    return this.prisma.babDraft.findMany({
      where: { babId: id },
      orderBy: { versi: 'desc' },
      include: { buktiDukungDraft: true, ragasScores: true, hasilSkorKriteria: true },
    });
  }

  /**
   * Manual checkpoint (tab Draft, §8.1).
   * ponytail: baca-lalu-tulis `versi`, bukan increment atomik — race dua
   * klik simultan gagal keras via `@@unique([babId, versi])`, bukan korup diam-diam.
   */
  async createDraft(id: string, dto: CreateBabDraftDto) {
    const { userId } = this.tenantContext.getOrThrow();
    const bab = await this.access.findOneScoped(id);

    const [user, buktiDukungBab, terakhir] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } }),
      this.prisma.buktiDukungBab.findMany({ where: { babDokumenId: id } }),
      this.prisma.babDraft.aggregate({ where: { babId: id }, _max: { versi: true } }),
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

  /** Kriteria rubrik dicocokkan lewat urutanBab, bukan FK ke BabDokumen.id (database.md §11). */
  async findRubrik(id: string) {
    const bab = await this.access.findOneScoped(id);
    const rows = await this.prisma.rubrikKriteriaBab.findMany({
      where: { urutanBab: bab.urutanBab },
      include: { kriteria: { include: { level: { orderBy: { skor: 'desc' } } } } },
    });
    return rows.map((row) => row.kriteria);
  }
}
