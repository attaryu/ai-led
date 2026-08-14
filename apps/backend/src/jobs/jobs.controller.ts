import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Protected } from '../tenant/protected.decorator';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

/**
 * Belum ada fitur nyata yang memanggil ini — generasi bab (Week 4) dan
 * asesmen AMI (Week 5) yang akan jadi pemanggil sungguhan lewat
 * `JobsService.enqueue()` langsung. Endpoint ini murni jalur uji manual
 * untuk row 16: buktikan job masuk antrean dan langsung dijawab 202,
 * tanpa menunggu worker (row 17) yang memang belum ada.
 */
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
