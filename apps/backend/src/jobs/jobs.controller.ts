import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Protected } from '../tenant/protected.decorator';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

/** Manual job-enqueue endpoint for ops/testing — real producers call JobsService.enqueue() directly. */
@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Protected()
  @HttpCode(202)
  async create(@Body() dto: CreateJobDto) {
    const job = await this.jobsService.enqueue(dto.type, dto.payload);
    return { jobId: job.id, bullJobId: job.bullJobId, status: job.status };
  }
}
