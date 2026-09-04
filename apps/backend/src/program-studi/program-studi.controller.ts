import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { ProgramStudiService } from './program-studi.service';
import { CreateProgramStudiDto } from './dto/create-program-studi.dto';
import { UpdateProgramStudiDto } from './dto/update-program-studi.dto';

@ApiTags('program-studi')
@ApiBearerAuth()
@Controller('program-studi')
export class ProgramStudiController {
  constructor(private readonly programStudiService: ProgramStudiService) {}

  @Post()
  @Protected(Role.ADMIN, Role.PIMPINAN)
  create(@Body() dto: CreateProgramStudiDto) {
    return this.programStudiService.create(dto);
  }

  @Get()
  @Protected()
  findAll() {
    return this.programStudiService.findAll();
  }

  @Get(':id')
  @Protected()
  findOne(@Param('id') id: string) {
    return this.programStudiService.findOne(id);
  }

  @Patch(':id')
  @Protected(Role.ADMIN, Role.PIMPINAN)
  update(@Param('id') id: string, @Body() dto: UpdateProgramStudiDto) {
    return this.programStudiService.update(id, dto);
  }

  @Delete(':id')
  @Protected(Role.ADMIN, Role.PIMPINAN)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.programStudiService.remove(id);
  }
}
