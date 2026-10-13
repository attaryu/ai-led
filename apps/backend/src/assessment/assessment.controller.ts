import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  ParseIntPipe,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { requireEnv } from '../config/env';
import { Protected } from '../tenant/protected.decorator';
import { AssessmentService } from './assessment.service';
import { AssessmentOverviewItemDto } from './dto/assessment-overview.dto';
import { RunEvalDto } from './dto/run-eval.dto';
import { RunJudgeDto } from './dto/run-judge.dto';
import { UpsertVerdictDto } from './dto/upsert-verdict.dto';

const READ_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('assessment')
@ApiBearerAuth()
@Controller()
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  /** Proxy to apps/ai's GET /assessment/indicators — the 78 AMI indicators live only in its cached rubric matrix, no Postgres master table. */
  @Get('assessment/indicators')
  @Protected(...READ_ROLES)
  async findIndicators() {
    const aiServiceUrl = requireEnv('AI_SERVICE_URL');

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/assessment/indicators`);
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }

    if (!upstream.ok) {
      throw new BadGatewayException('Gagal memuat daftar indikator dari AI service');
    }

    return upstream.json();
  }

  /** Ringkasan semua Dokumen LED tenant untuk Dashboard Utama; hanya PIMPINAN & PENJAMIN_MUTU. */
  @Get('assessment/overview')
  @Protected(Role.PIMPINAN, Role.PENJAMIN_MUTU)
  @ApiOkResponse({ type: AssessmentOverviewItemDto, isArray: true })
  getOverview() {
    return this.assessmentService.getOverview();
  }

  @Get('dokumen/:dokumenId/assessment-sessions')
  @Protected(...READ_ROLES)
  findSessions(@Param('dokumenId') dokumenId: string) {
    return this.assessmentService.findSessions(dokumenId);
  }

  @Get('assessment-sessions/:id')
  @Protected(...READ_ROLES)
  findSessionDetail(@Param('id') id: string) {
    return this.assessmentService.findSessionDetail(id);
  }

  @Get('assessment-sessions/:id/results')
  @Protected(...READ_ROLES)
  findResults(@Param('id') id: string) {
    return this.assessmentService.findResults(id);
  }

  /** Hasil terbaru per indikator lintas semua sesi dokumen ini — dipakai saat melihat sesi terbaru, lihat AssessmentService.findResultsForDocument. */
  @Get('dokumen/:dokumenId/assessment-results')
  @Protected(...READ_ROLES)
  findResultsForDocument(@Param('dokumenId') dokumenId: string) {
    return this.assessmentService.findResultsForDocument(dokumenId);
  }

  @Get('assessment-sessions/:id/reasoning')
  @Protected(...READ_ROLES)
  findReasoning(
    @Param('id') id: string,
    @Query('indicatorNo', ParseIntPipe) indicatorNo: number,
    @Query('subNo') subNo?: string,
  ) {
    return this.assessmentService.findReasoning(id, indicatorNo, subNo);
  }

  @Post('assessment-sessions/:id/eval')
  @Protected(Role.PENJAMIN_MUTU, Role.PENYUSUN)
  runEval(@Param('id') id: string, @Body() dto: RunEvalDto) {
    return this.assessmentService.runEval(id, dto);
  }

  /** Proxy to apps/ai's GET /eval/{eval_id}/results — poll for RAGAS eval progress/result. */
  @Get('assessment-eval/:evalId')
  @Protected(...READ_ROLES)
  findEvalResult(@Param('evalId') evalId: string) {
    return this.assessmentService.findEvalResult(evalId);
  }

  /** Proxy to apps/ai's POST /assessment/:id/judge -- judge grounding on-demand; tanpa job BullMQ. */
  @Post('assessment-sessions/:id/judge')
  @Protected(Role.PENJAMIN_MUTU, Role.PENYUSUN)
  runJudge(@Param('id') id: string, @Body() dto: RunJudgeDto) {
    return this.assessmentService.runJudge(id, dto);
  }

  /** Proxy to apps/ai's GET /assessment/judge/:judgeId -- poll progres judge. */
  @Get('assessment-judge/:judgeId')
  @Protected(...READ_ROLES)
  findJudgeStatus(@Param('judgeId') judgeId: string) {
    return this.assessmentService.findJudgeStatus(judgeId);
  }

  @Get('dokumen/:dokumenId/assessment-verdicts')
  @Protected(...READ_ROLES)
  findVerdicts(@Param('dokumenId') dokumenId: string) {
    return this.assessmentService.findVerdicts(dokumenId);
  }

  /** Hanya Penjamin Mutu — lihat docs/database.md §12b & assessment-verdict.entity.ts. */
  @Post('dokumen/:dokumenId/assessment-verdicts')
  @Protected(Role.PENJAMIN_MUTU)
  upsertVerdict(
    @Param('dokumenId') dokumenId: string,
    @Body() dto: UpsertVerdictDto,
  ) {
    return this.assessmentService.upsertVerdict(dokumenId, dto);
  }

  @Delete('dokumen/:dokumenId/assessment-verdicts/:indikatorNo')
  @Protected(Role.PENJAMIN_MUTU)
  @HttpCode(204)
  removeVerdict(
    @Param('dokumenId') dokumenId: string,
    @Param('indikatorNo', ParseIntPipe) indikatorNo: number,
    @Query('subNo') subNo?: string,
  ) {
    return this.assessmentService.removeVerdict(dokumenId, indikatorNo, subNo ?? '');
  }
}
