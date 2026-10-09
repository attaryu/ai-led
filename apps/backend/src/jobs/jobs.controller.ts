import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Protected } from '../tenant/protected.decorator';
import { JobsService } from './jobs.service';

/** Jobs are only enqueued by domain services (JobsService.enqueue), never from a raw client payload: the worker trusts payload tenant/file ids. */
@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post(':id/cancel')
  @Protected()
  @HttpCode(202)
  async cancel(@Param('id') id: string) {
    await this.jobsService.cancel(id);
    return { status: 'cancel_requested' };
  }
}
