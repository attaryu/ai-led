import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@ai-led/db';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  BabAccessService,
  withSectionList,
  withSectionListSelect,
  withSectionReview,
  withSectionReviewSelect,
} from './bab-access.service';
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
    const dokumen = await this.access.findDokumenScoped(dokumenId);
    await this.syncFromTemplate(dokumenId, dokumen.accreditationSetId);
    const chapters = await this.prisma.documentChapter.findMany({
      where: { documentId: dokumenId },
      orderBy: { chapterOrder: 'asc' },
      // buktiDukungBab ikut: ringkasan progres dashboard menghitung "Bukti Dukung Dipakai" darinya.
      include: { ...withSectionListSelect, buktiDukungBab: true },
    });
    return chapters.map(withSectionList);
  }

  /** Selaraskan bab dokumen ke ChapterTemplate terkini -- create+rename aja, gak pernah hapus bab yatim. */
  private async syncFromTemplate(
    dokumenId: string,
    accreditationSetId: string | null,
  ): Promise<void> {
    if (!accreditationSetId) return;

    const set = await this.prisma.accreditationSet.findUnique({
      where: { id: accreditationSetId },
      select: { panduanId: true },
    });
    if (!set?.panduanId) return;

    const templates = await this.prisma.chapterTemplate.findMany({
      where: { guideId: set.panduanId },
      select: { order: true, title: true },
    });
    if (templates.length === 0) return;

    const existing = await this.prisma.documentChapter.findMany({
      where: { documentId: dokumenId },
      select: { chapterOrder: true, chapterTitle: true },
    });
    const existingTitleByOrder = new Map(
      existing.map((e) => [e.chapterOrder, e.chapterTitle]),
    );

    const toCreate = templates.filter((t) => !existingTitleByOrder.has(t.order));
    const toRename = templates.filter(
      (t) =>
        existingTitleByOrder.has(t.order) &&
        existingTitleByOrder.get(t.order) !== t.title,
    );
    if (toCreate.length === 0 && toRename.length === 0) return;

    await this.prisma.$transaction([
      ...toCreate.map((t) =>
        this.prisma.documentChapter.create({
          data: {
            documentId: dokumenId,
            chapterOrder: t.order,
            chapterTitle: t.title,
            workingContent: {},
          },
        }),
      ),
      ...toRename.map((t) =>
        this.prisma.documentChapter.updateMany({
          where: { documentId: dokumenId, chapterOrder: t.order },
          data: { chapterTitle: t.title },
        }),
      ),
    ]);
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
        ...withSectionReviewSelect,
      },
    });
    if (!bab) {
      throw new NotFoundException('Bab dokumen tidak ditemukan');
    }
    this.access.assertProgramStudiScope(bab.document.studyProgramId);

    const { document, ...rest } = bab;
    void document;
    return withSectionReview(rest);
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
