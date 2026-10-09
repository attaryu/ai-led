import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '@ai-led/db';
import { requireEnv } from '../config/env';
import { Protected } from '../tenant/protected.decorator';
import { BabDokumenService } from './bab-dokumen.service';
import { BabDraftService } from './bab-draft.service';
import { BabPipelineService } from './bab-pipeline.service';
import { BabReviewService } from './bab-review.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ConfirmRecommendationDto } from './dto/confirm-recommendation.dto';
import { CreateBabDokumenDto } from './dto/create-bab-dokumen.dto';
import { CreateBabDraftDto } from './dto/create-bab-draft.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { EvidenceSelectionDto } from './dto/evidence-selection.dto';
import { GenerateBabDto } from './dto/generate-bab.dto';
import { GenerateOutlineDto } from './dto/generate-outline.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { RecommendDocumentsDto } from './dto/recommend-documents.dto';
import { SimulateScoreDto } from './dto/simulate-score.dto';
import { UpdateBabDokumenDto } from './dto/update-bab-dokumen.dto';
import { ReviewStatusDto } from './dto/review-status.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

// Same role split as DokumenLedController; review actions are exclusive to one role each — docs/database.md §5-6.
const READ_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];
const WRITE_ROLES = [Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('bab-dokumen')
@ApiBearerAuth()
@Controller()
export class BabDokumenController {
  constructor(
    private readonly babDokumenService: BabDokumenService,
    private readonly babDraftService: BabDraftService,
    private readonly babReviewService: BabReviewService,
    private readonly babPipelineService: BabPipelineService,
  ) {}

  @Post('dokumen/:dokumenId/bab')
  @Protected(...WRITE_ROLES)
  create(
    @Param('dokumenId') dokumenId: string,
    @Body() dto: CreateBabDokumenDto,
  ) {
    return this.babDokumenService.create(dokumenId, dto);
  }

  @Get('dokumen/:dokumenId/bab')
  @Protected(...READ_ROLES)
  findAllForDokumen(@Param('dokumenId') dokumenId: string) {
    return this.babDokumenService.findAllForDokumen(dokumenId);
  }

  /** Lintas prodi — Dashboard Utama KPI. */
  @Get('bab')
  @Protected(...READ_ROLES)
  findAllForTenant() {
    return this.babDokumenService.findAllForTenant();
  }

  @Get('bab/:id')
  @Protected(...READ_ROLES)
  findOne(@Param('id') id: string) {
    return this.babDokumenService.findOne(id);
  }

  @Patch('bab/:id')
  @Protected(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateBabDokumenDto) {
    return this.babDokumenService.update(id, dto);
  }

  @Post('bab/:id/outline')
  @Protected(...WRITE_ROLES)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Trigger penyusunan outline (daftar section) untuk bab (Producer GENERASI_OUTLINE_BAB)',
  })
  generateOutline(@Param('id') id: string, @Body() dto: GenerateOutlineDto) {
    return this.babPipelineService.triggerGenerateOutline(id, dto.overwrite);
  }

  @Get('bab/:id/sections')
  @Protected(...READ_ROLES)
  findSections(@Param('id') id: string) {
    return this.babPipelineService.findSections(id);
  }

  @Get('bab/:id/sections/:sectionId/sumber')
  @Protected(...READ_ROLES)
  @ApiOperation({
    summary: 'Chunk asli yang dipakai AI menyusun section ini, backing hover-card sitasi di editor',
  })
  findSourcesForSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.babPipelineService.findSourcesForSection(id, sectionId);
  }

  @Post('bab/:id/sections/:sectionId/generate')
  @Protected(...WRITE_ROLES)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Trigger generasi konten AI untuk satu section (Producer GENERASI_BAB)',
  })
  generateSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: GenerateBabDto,
  ) {
    return this.babPipelineService.triggerGenerate(
      id,
      sectionId,
      dto.prompt,
      dto.draftId,
      dto.selectedEvidenceIds,
    );
  }

  @Put('bab/:id/sections/:sectionId/evidence-selection')
  @Protected(...WRITE_ROLES)
  @ApiOperation({ summary: 'Simpan centang bukti dukung untuk satu section (replace)' })
  updateSectionEvidenceSelection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: EvidenceSelectionDto,
  ) {
    return this.babPipelineService.updateSectionEvidenceSelection(id, sectionId, dto.evidenceIds);
  }

  @Post('bab/:id/sections')
  @Protected(...WRITE_ROLES)
  createSection(@Param('id') id: string, @Body() dto: CreateSectionDto) {
    return this.babPipelineService.createSection(id, dto);
  }

  @Patch('bab/:id/sections/:sectionId')
  @Protected(...WRITE_ROLES)
  updateSection(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.babPipelineService.updateSection(id, sectionId, dto);
  }

  @Delete('bab/:id/sections/:sectionId')
  @Protected(...WRITE_ROLES)
  @HttpCode(204)
  deleteSection(@Param('id') id: string, @Param('sectionId') sectionId: string) {
    return this.babPipelineService.deleteSection(id, sectionId);
  }

  @Post('bab/:id/sections/:sectionId/evaluate-quality')
  @Protected(...WRITE_ROLES)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Trigger penilaian kualitas RAGAS atas satu section (Producer PENILAIAN_RAGAS)',
  })
  evaluateQuality(@Param('id') id: string, @Param('sectionId') sectionId: string) {
    return this.babPipelineService.triggerEvaluasiRagas(id, sectionId);
  }

  @Post('bab/:id/recommend-documents')
  @Protected(...WRITE_ROLES)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Trigger rekomendasi dokumen untuk bab (Producer REKOMENDASI_DOKUMEN)',
  })
  recommendDocuments(@Param('id') id: string, @Body() dto: RecommendDocumentsDto) {
    return this.babPipelineService.triggerRecommendDocuments(id, dto.draftId, dto.sectionId);
  }

  @Get('bab/:id/recommendation')
  @Protected(...READ_ROLES)
  findRecommendation(
    @Param('id') id: string,
    @Query('draftId') draftId?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.babPipelineService.findRecommendation(id, draftId, sectionId);
  }

  @Post('bab/:id/recommend-documents/confirm')
  @Protected(...WRITE_ROLES)
  confirmRecommendation(@Param('id') id: string, @Body() dto: ConfirmRecommendationDto) {
    return this.babPipelineService.confirmRecommendation(id, dto);
  }

  @Get('bab/:id/drafts')
  @Protected(...READ_ROLES)
  findDrafts(@Param('id') id: string) {
    return this.babDraftService.findDrafts(id);
  }

  @Get('bab/:id/sections/:sectionId/drafts')
  @Protected(...READ_ROLES)
  findSectionDrafts(@Param('sectionId') sectionId: string) {
    return this.babDraftService.findSectionDrafts(sectionId);
  }

  @Post('bab/:id/sections/:sectionId/drafts')
  @Protected(...WRITE_ROLES)
  createSectionDraft(@Param('sectionId') sectionId: string, @Body() dto: CreateBabDraftDto) {
    return this.babDraftService.createSectionDraft(sectionId, dto);
  }

  @Post('bab/:id/sections/:sectionId/drafts/:draftId/restore')
  @Protected(...WRITE_ROLES)
  restoreSectionDraft(
    @Param('sectionId') sectionId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.babDraftService.restoreSectionDraft(sectionId, draftId);
  }

  @Delete('bab/:id/sections/:sectionId/drafts/:draftId')
  @Protected(...WRITE_ROLES)
  @HttpCode(204)
  @ApiOperation({ summary: 'Hapus satu checkpoint section dari Riwayat Draft' })
  deleteSectionDraft(
    @Param('sectionId') sectionId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.babDraftService.deleteSectionDraft(sectionId, draftId);
  }

  @Get('bab/:id/rubrik')
  @Protected(...READ_ROLES)
  findRubrik(@Param('id') id: string) {
    return this.babDraftService.findRubrik(id);
  }

  @Post('bab/:id/simulasi-skor')
  @Protected(...WRITE_ROLES)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Trigger simulasi skor rubrik untuk bab (Producer SIMULASI_SKOR)',
  })
  simulateScore(@Param('id') id: string, @Body() dto: SimulateScoreDto) {
    return this.babPipelineService.triggerSimulateScore(id, dto.chapterDraftId);
  }

  /** SSE passthrough proxy to apps/ai's POST /chat/:sectionId — per-section (dimas parity), balasan asisten langsung revisi section.content di apps/ai. */
  @Post('bab/:id/sections/:sectionId/chat')
  @Protected(...WRITE_ROLES)
  async chat(
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    const { userId } = await this.babPipelineService.assertSectionChatAccess(sectionId);
    const aiServiceUrl = requireEnv('AI_SERVICE_URL');

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/chat/${sectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: dto.message, user_id: userId }),
        signal: abortController.signal,
      });
    } catch {
      res.status(502).json({ message: 'AI service tidak dapat dihubungi' });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      res.status(upstream.status || 502).json({
        message: 'Gagal memulai chat stream dari AI service',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
      // apps/ai sudah menulis revisi ke section.content -- susun ulang isi bab (sama seperti autosave section).
      await this.babPipelineService.recompileChapterContent(id).catch(() => undefined);
    }
  }

  /** Plain JSON passthrough to apps/ai's GET /chat/:sectionId/history — same no-direct-access rule as the stream above. */
  @Get('bab/:id/sections/:sectionId/chat/history')
  @Protected(...READ_ROLES)
  async chatHistory(@Param('sectionId') sectionId: string) {
    await this.babPipelineService.assertSectionChatAccess(sectionId);
    const aiServiceUrl = requireEnv('AI_SERVICE_URL');

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/chat/${sectionId}/history`);
    } catch {
      throw new BadGatewayException('AI service tidak dapat dihubungi');
    }

    if (!upstream.ok) {
      throw new BadGatewayException('Gagal memuat riwayat chat dari AI service');
    }

    return upstream.json();
  }

  @Post('bab/:id/sections/:sectionId/submit-review')
  @Protected(Role.PENYUSUN)
  @HttpCode(200)
  submitForReview(@Param('sectionId') sectionId: string, @Body() dto: SubmitReviewDto) {
    return this.babReviewService.submitForReview(sectionId, dto);
  }

  @Patch('bab/:id/sections/:sectionId/review-status')
  @Protected(Role.PENJAMIN_MUTU)
  setReviewStatus(@Param('sectionId') sectionId: string, @Body() dto: ReviewStatusDto) {
    return this.babReviewService.setReviewStatus(sectionId, dto);
  }

  @Delete('bab/:id')
  @Protected(Role.PENJAMIN_MUTU)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.babDokumenService.remove(id);
  }
}
