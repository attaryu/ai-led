import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@ai-led/db';
import type { AssessmentOverviewItemDto } from './dto/assessment-overview.dto';
import { requireEnv } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { DokumenLedService } from '../dokumen-led/dokumen-led.service';
import { RunEvalDto } from './dto/run-eval.dto';
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

  /**
   * Ringkasan penilaian semua Dokumen LED tenant (PIMPINAN / PENJAMIN_MUTU) dalam
   * 4 query tetap, bukan N+1 per dokumen. Tenant lewat `studyProgram.tenantId`,
   * sama seperti DokumenLedService.findAllForTenant.
   */
  async getOverview(): Promise<AssessmentOverviewItemDto[]> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const documents = await this.prisma.ledDocument.findMany({
      where: { studyProgram: { tenantId } },
      select: { id: true, studyProgramId: true },
      orderBy: { createdAt: 'desc' },
    });
    const documentIds = documents.map((d) => d.id);
    if (documentIds.length === 0) return [];

    const [sessions, verdicts] = await Promise.all([
      // Satu sesi terbaru per dokumen.
      this.prisma.assessmentSession.findMany({
        where: { documentId: { in: documentIds } },
        distinct: ['documentId'],
        orderBy: [{ documentId: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.assessmentVerdict.findMany({
        where: { documentId: { in: documentIds } },
        select: { documentId: true, finalScore: true, machineScoreAtReview: true },
      }),
    ]);
    const sessionByDocument = new Map(sessions.map((s) => [s.documentId, s]));
    const results = sessions.length
      ? await this.prisma.indicatorResult.findMany({
          where: { sessionId: { in: sessions.map((s) => s.id) } },
          select: { sessionId: true, score: true, error: true },
        })
      : [];

    const resultsBySession = new Map<string, typeof results>();
    for (const r of results) {
      const list = resultsBySession.get(r.sessionId);
      if (list) list.push(r);
      else resultsBySession.set(r.sessionId, [r]);
    }
    const verdictsByDocument = new Map<string, typeof verdicts>();
    for (const v of verdicts) {
      const list = verdictsByDocument.get(v.documentId);
      if (list) list.push(v);
      else verdictsByDocument.set(v.documentId, [v]);
    }

    return documents.map((doc) => {
      const session = sessionByDocument.get(doc.id) ?? null;
      const sessionResults = session ? (resultsBySession.get(session.id) ?? []) : [];
      const scores = sessionResults
        .filter((r) => r.score !== null)
        .map((r) => Number(r.score));
      const docVerdicts = verdictsByDocument.get(doc.id) ?? [];
      const sum = scores.reduce((a, b) => a + b, 0);
      return {
        documentId: doc.id,
        studyProgramId: doc.studyProgramId,
        session: session
          ? {
              id: session.id,
              status: session.status,
              totalIndicators: session.totalIndicators,
              completedIndicators: session.completedIndicators,
              createdAt: session.createdAt.toISOString(),
            }
          : null,
        scored: scores.length,
        failed: sessionResults.filter((r) => r.score === null && r.error !== null).length,
        averageScore: scores.length ? Math.round((sum / scores.length) * 100) / 100 : null,
        lowScoreCount: scores.filter((s) => s <= 2).length,
        reviewed: docVerdicts.length,
        corrected: docVerdicts.filter(
          (v) =>
            v.machineScoreAtReview !== null &&
            Number(v.finalScore) !== Number(v.machineScoreAtReview),
        ).length,
      };
    });
  }

  async findSessions(dokumenId: string) {
    await this.dokumenLedService.findOne(dokumenId); // isolasi tenant + 404
    return this.prisma.assessmentSession.findMany({
      where: { documentId: dokumenId },
      orderBy: { createdAt: 'desc' },
      include: this.includeCreatedByName,
    });
  }

  private async findSessionScoped(id: string) {
    const { tenantId, role, studyProgramId } = this.tenantContext.getOrThrow();
    const session = await this.prisma.assessmentSession.findFirst({
      where: {
        id,
        tenantId,
        // PENYUSUN only sees sessions of their own prodi's documents.
        ...(role === Role.PENYUSUN ? { document: { studyProgramId: studyProgramId ?? '' } } : {}),
      },
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

  /**
   * Hasil terbaru per indikator, digabung lintas SEMUA sesi dokumen ini —
   * bukan cuma sesi terbaru.
   *
   * "Freestyle indicator picking" (use-assessment-indicator-picks.ts) sengaja
   * membiarkan pengguna mencicil: nilai indikator 1-2 dulu, lihat hasilnya,
   * lalu nilai indikator 3-6 di run terpisah. Tiap run bikin `AssessmentSession`
   * baru (lihat DokumenLedService.triggerAssessment) — kalau tabel hasil cuma
   * baca sesi terbaru, indikator dari run sebelumnya "hilang" dari layar
   * padahal datanya masih utuh di Postgres, cuma nempel di sesi lain.
   */
  async findResultsForDocument(dokumenId: string) {
    await this.dokumenLedService.findOne(dokumenId); // isolasi tenant + 404
    const results = await this.prisma.indicatorResult.findMany({
      where: { session: { documentId: dokumenId } },
      orderBy: { createdAt: 'desc' },
    });
    // Kunci = nomor + sub-indikator: 43.I dan 43.II adalah dua hasil berbeda, bukan satu yang saling menimpa.
    const terbaruPerIndikator = new Map<string, (typeof results)[number]>();
    for (const hasil of results) {
      const kunci = `${hasil.indicatorNo}|${hasil.subNo}`;
      if (!terbaruPerIndikator.has(kunci)) {
        terbaruPerIndikator.set(kunci, hasil);
      }
    }
    return [...terbaruPerIndikator.values()].sort(
      (a, b) => a.indicatorNo - b.indicatorNo || a.subNo.localeCompare(b.subNo),
    );
  }

  async findReasoning(sessionId: string, indicatorNo: number, subNo?: string) {
    await this.findSessionScoped(sessionId);
    return this.prisma.reasoningStep.findMany({
      // subNo kosong = semua sub dari nomor ini (perilaku lama); diisi = hanya sub-indikator itu.
      where: { sessionId, indicatorNo, ...(subNo ? { subNo } : {}) },
      orderBy: { stepIndex: 'asc' },
    });
  }

  /**
   * Proxy to apps/ai's `POST /eval/run` — starts a RAGAS quality eval reading
   * real justifications from this session. `findSessionScoped` first, unlike
   * the raw `fetch` this replaced: without it, any authenticated user could
   * trigger (and burn LLM-judge time on) an eval for a session id belonging
   * to another tenant, since apps/ai itself has no tenant concept to check.
   */
  /** Proxy to apps/ai's GET /eval/{id}/results, scoped through the eval's own session (apps/ai has no tenant concept). */
  async findEvalResult(evalId: string) {
    const aiServiceUrl = requireEnv('AI_SERVICE_URL');

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/eval/${encodeURIComponent(evalId)}/results`);
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }
    if (upstream.status === 404) {
      throw new NotFoundException('Hasil evaluasi tidak ditemukan');
    }
    if (!upstream.ok) {
      throw new BadGatewayException('Gagal memuat hasil evaluasi RAGAS');
    }

    const result = (await upstream.json()) as { session_id?: string | null };
    if (!result.session_id) {
      throw new NotFoundException('Hasil evaluasi tidak ditemukan');
    }
    await this.findSessionScoped(result.session_id);
    return result;
  }

  async runEval(id: string, dto: RunEvalDto) {
    await this.findSessionScoped(id);
    const aiServiceUrl = requireEnv('AI_SERVICE_URL');

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/eval/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: id, n_indicators: dto.nIndicators }),
      });
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }

    if (!upstream.ok) {
      throw new BadGatewayException('Gagal memulai evaluasi RAGAS');
    }

    return upstream.json();
  }

  async findVerdicts(dokumenId: string) {
    await this.dokumenLedService.findOne(dokumenId);
    return this.prisma.assessmentVerdict.findMany({ where: { documentId: dokumenId } });
  }

  /** machineScoreAtReview/sessionIdAtReview are derived here, never trusted from the request body — provenance can't be spoofed. */
  async upsertVerdict(dokumenId: string, dto: UpsertVerdictDto) {
    const dokumen = await this.dokumenLedService.findOne(dokumenId);
    const { userId } = this.tenantContext.getOrThrow();

    // UpsertVerdictDto only enforces >= 0 (the criterion-specific max isn't a
    // static constant, it's whatever this indicator's highest RubricLevel
    // happens to be) -- the frontend's <input max=...> is a soft browser hint,
    // never a real bound, so it has to be re-checked here too.
    if (dokumen.accreditationSetId) {
      // ponytail: findUnique -> findMany. Sejak kolom `sub_no` ada (migrasi
      // 20261007100000), satu indicatorNo bisa punya BEBERAPA baris -- satu per
      // sub-indikator komposit (I, II, ...), jadi compound unique
      // accreditationSetId_indicatorNo tidak ada lagi dan findUnique gagal
      // dikompilasi. Skor maksimal diambil dari level tertinggi di SELURUH baris
      // indikator ini: skor yang dikirim penilai adalah skor indikatornya, bukan
      // skor satu sub-indikator.
      // const criterion = await this.prisma.rubricCriterion.findUnique({
      //   where: { accreditationSetId_indicatorNo: { ... } },
      //   include: { levels: true },
      // });
      const criteria = await this.prisma.rubricCriterion.findMany({
        where: {
          accreditationSetId: dokumen.accreditationSetId,
          indicatorNo: dto.indicatorNo,
          // Skor maksimal hanya dari sub-indikator yang dinilai bila subNo diisi.
          ...(dto.subNo ? { subNo: dto.subNo } : {}),
        },
        include: { levels: true },
      });
      const semuaLevel = criteria.flatMap((c) => c.levels);
      const skorMaksimal = semuaLevel.length
        ? Math.max(...semuaLevel.map((level) => level.score))
        : undefined;
      if (skorMaksimal !== undefined && dto.finalScore > skorMaksimal) {
        throw new BadRequestException(
          `Skor tidak boleh melebihi level tertinggi indikator ini (${skorMaksimal})`,
        );
      }
    }

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
        sessionId_indicatorNo_subNo: {
          sessionId: latestSession.id,
          indicatorNo: dto.indicatorNo,
          subNo: dto.subNo ?? '',
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
        documentId_indicatorNo_subNo: {
          documentId: dokumenId,
          indicatorNo: dto.indicatorNo,
          subNo: dto.subNo ?? '',
        },
      },
      create: { documentId: dokumenId, indicatorNo: dto.indicatorNo, subNo: dto.subNo ?? '', ...shared },
      update: { ...shared, reviewedAt: new Date() },
    });
  }

  /** Mencabut keputusan — indikatornya kembali ke "Belum ditinjau". */
  async removeVerdict(dokumenId: string, indikatorNo: number, subNo = '') {
    await this.dokumenLedService.findOne(dokumenId);
    await this.prisma.assessmentVerdict.deleteMany({
      where: { documentId: dokumenId, indicatorNo: indikatorNo, subNo },
    });
  }
}
