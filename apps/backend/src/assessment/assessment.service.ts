import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { DokumenLedService } from '../dokumen-led/dokumen-led.service';
import { UpsertVerdictDto } from './dto/upsert-verdict.dto';

/** AMI assessment reads (session/results/reasoning) + Penjamin Mutu verdicts — the trigger itself stays in DokumenLedService. */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly dokumenLedService: DokumenLedService,
  ) {}

  /** Read via relation join instead of denormalizing a name column — read-heavy, so the extra join is cheaper. */
  private readonly includeCreatedByName = {
    createdBy: { select: { fullName: true } },
  } as const;

  async findSessions(dokumenId: string) {
    await this.dokumenLedService.findOne(dokumenId); // isolasi tenant + 404
    return this.prisma.assessmentSession.findMany({
      where: { documentId: dokumenId },
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
    return this.prisma.assessmentVerdict.findMany({ where: { documentId: dokumenId } });
  }

  /** machineScoreAtReview/sessionIdAtReview are derived here, never trusted from the request body — provenance can't be spoofed. */
  async upsertVerdict(dokumenId: string, dto: UpsertVerdictDto) {
    await this.dokumenLedService.findOne(dokumenId);
    const { userId } = this.tenantContext.getOrThrow();

    const latestSession = await this.prisma.assessmentSession.findFirst({
      where: { documentId: dokumenId },
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
          indicatorNo: dto.indicatorNo,
        },
      },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const shared = {
      finalScore: dto.finalScore,
      note: dto.note ?? null,
      machineScoreAtReview: currentResult?.score ?? null,
      sessionIdAtReview: latestSession.id,
      reviewedByUserId: userId,
      reviewedByName: user.fullName,
    };

    return this.prisma.assessmentVerdict.upsert({
      where: {
        documentId_indicatorNo: { documentId: dokumenId, indicatorNo: dto.indicatorNo },
      },
      create: { documentId: dokumenId, indicatorNo: dto.indicatorNo, ...shared },
      update: { ...shared, reviewedAt: new Date() },
    });
  }

  /** Mencabut keputusan — indikatornya kembali ke "Belum ditinjau". */
  async removeVerdict(dokumenId: string, indikatorNo: number) {
    await this.dokumenLedService.findOne(dokumenId);
    await this.prisma.assessmentVerdict.deleteMany({
      where: { documentId: dokumenId, indicatorNo: indikatorNo },
    });
  }
}
