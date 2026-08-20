import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { DokumenLedService } from '../dokumen-led/dokumen-led.service';
import { UpsertVerdictDto } from './dto/upsert-verdict.dto';

/**
 * Sisi baca (session/results/reasoning) & keputusan Penjamin Mutu
 * (verdicts) untuk Penilaian AMI — pemicunya sendiri (`POST
 * dokumen/:id/assessment`) tetap di DokumenLedService, tidak dipindah ke
 * sini, supaya diffnya kecil.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly dokumenLedService: DokumenLedService,
  ) {}

  // `createdBy.namaLengkap` di-include lewat relasi, bukan didenormalisasi
  // ke kolom sendiri seperti BabDraft.dibuatOlehNama dkk — sesi ini
  // dibaca lebih sering lewat join daripada ditulis, jadi satu query
  // ekstra saat baca lebih murah daripada kolom kedua yang harus selalu
  // ikut disetel Python (db/postgres_client.py::create_session).
  private readonly includeCreatedByName = {
    createdBy: { select: { namaLengkap: true } },
  } as const;

  async findSessions(dokumenId: string) {
    await this.dokumenLedService.findOne(dokumenId); // isolasi tenant + 404
    return this.prisma.assessmentSession.findMany({
      where: { dokumenId },
      orderBy: { createdAt: 'desc' },
      include: this.includeCreatedByName,
    });
  }

  private async findSessionScoped(id: string) {
    const { tenantId } = this.tenantContext.getOrThrow();
    const session = await this.prisma.assessmentSession.findFirst({
      where: { id, tenantId },
      include: this.includeCreatedByName,
    });
    if (!session) {
      throw new NotFoundException('Sesi penilaian tidak ditemukan');
    }
    return session;
  }

  findSessionDetail(id: string) {
    return this.findSessionScoped(id);
  }

  async findResults(sessionId: string) {
    await this.findSessionScoped(sessionId);
    return this.prisma.indicatorResult.findMany({
      where: { sessionId },
      orderBy: { indicatorNo: 'asc' },
    });
  }

  async findReasoning(sessionId: string, indicatorNo: number) {
    await this.findSessionScoped(sessionId);
    return this.prisma.reasoningStep.findMany({
      where: { sessionId, indicatorNo },
      orderBy: { stepIndex: 'asc' },
    });
  }

  async findVerdicts(dokumenId: string) {
    await this.dokumenLedService.findOne(dokumenId);
    return this.prisma.assessmentVerdict.findMany({ where: { dokumenId } });
  }

  /**
   * `skorMesinSaatDitinjau`/`sesiIdSaatDitinjau` **tidak** diterima dari
   * body — dibaca di sini dari sesi terbaru dokumen ini, bukan dipercaya
   * dari klien, supaya provenance keputusan (dasar apa yang sedang
   * dipertimbangkan Penjamin Mutu) tidak bisa dipalsukan lewat request yang
   * dibentuk manual.
   */
  async upsertVerdict(dokumenId: string, dto: UpsertVerdictDto) {
    await this.dokumenLedService.findOne(dokumenId);
    const { userId } = this.tenantContext.getOrThrow();

    const latestSession = await this.prisma.assessmentSession.findFirst({
      where: { dokumenId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latestSession) {
      throw new BadRequestException(
        'Belum pernah ada sesi penilaian untuk dokumen ini',
      );
    }

    const currentResult = await this.prisma.indicatorResult.findUnique({
      where: {
        sessionId_indicatorNo: {
          sessionId: latestSession.id,
          indicatorNo: dto.indikatorNo,
        },
      },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const shared = {
      skorFinal: dto.skorFinal,
      catatan: dto.catatan ?? null,
      skorMesinSaatDitinjau: currentResult?.score ?? null,
      sesiIdSaatDitinjau: latestSession.id,
      ditinjauOlehUserId: userId,
      ditinjauOlehNama: user.namaLengkap,
    };

    return this.prisma.assessmentVerdict.upsert({
      where: {
        dokumenId_indikatorNo: { dokumenId, indikatorNo: dto.indikatorNo },
      },
      create: { dokumenId, indikatorNo: dto.indikatorNo, ...shared },
      update: { ...shared, ditinjauPada: new Date() },
    });
  }

  /** Mencabut keputusan — indikatornya kembali ke "Belum ditinjau". */
  async removeVerdict(dokumenId: string, indikatorNo: number) {
    await this.dokumenLedService.findOne(dokumenId);
    await this.prisma.assessmentVerdict.deleteMany({
      where: { dokumenId, indikatorNo },
    });
  }
}
