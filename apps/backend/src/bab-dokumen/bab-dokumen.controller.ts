import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '@ai-led/db';
import { requireEnv } from '../config/env';
import { Protected } from '../tenant/protected.decorator';
import { BabDokumenService } from './bab-dokumen.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { CreateBabDokumenDto } from './dto/create-bab-dokumen.dto';
import { UpdateBabDokumenDto } from './dto/update-bab-dokumen.dto';
import { ReviewStatusDto } from './dto/review-status.dto';

// Same role split as DokumenLedController: ADMIN has zero access, PIMPINAN
// read-only, PENJAMIN_MUTU/PENYUSUN full content rights (minus the review
// actions, which are exclusive to one role each - see docs/database.md §5-6.
const READ_ROLES = [Role.PIMPINAN, Role.PENJAMIN_MUTU, Role.PENYUSUN];
const WRITE_ROLES = [Role.PENJAMIN_MUTU, Role.PENYUSUN];

@ApiTags('bab-dokumen')
@ApiBearerAuth()
@Controller()
export class BabDokumenController {
  constructor(private readonly babDokumenService: BabDokumenService) {}

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

  @Post('bab/:id/generate')
  @Protected(...WRITE_ROLES)
  @HttpCode(202)
  @ApiOperation({
    summary: 'Trigger generasi konten AI untuk bab (Producer GENERASI_BAB)',
  })
  generate(@Param('id') id: string) {
    return this.babDokumenService.triggerGenerate(id);
  }

  /**
   * Passthrough SSE proxy to apps/ai's POST /chat/:id — @Res() raw
   * response, not @Sse(), since this is forwarding an already-SSE-shaped
   * upstream byte stream rather than emitting our own Observable of
   * events (and @Sse() only supports GET without reaching into NestJS's
   * internal route-metadata constants). apps/ai owns the chat_messages
   * writes itself (it has the full assistant reply only after the stream
   * ends) — this route never touches Postgres.
   */
  @Post('bab/:id/chat')
  @Protected(...WRITE_ROLES)
  async chat(
    @Param('id') id: string,
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    const { userId } = await this.babDokumenService.assertChatAccess(id);
    const aiServiceUrl = requireEnv('AI_SERVICE_URL');

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${aiServiceUrl}/chat/${id}`, {
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
    }
  }

  @Post('bab/:id/submit-review')
  @Protected(Role.PENYUSUN)
  @HttpCode(200)
  submitForReview(@Param('id') id: string) {
    return this.babDokumenService.submitForReview(id);
  }

  @Patch('bab/:id/review-status')
  @Protected(Role.PENJAMIN_MUTU)
  setReviewStatus(@Param('id') id: string, @Body() dto: ReviewStatusDto) {
    return this.babDokumenService.setReviewStatus(id, dto);
  }

  @Delete('bab/:id')
  @Protected(Role.PENJAMIN_MUTU)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.babDokumenService.remove(id);
  }
}
