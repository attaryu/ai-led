import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@ai-led/db';
import { Protected } from '../tenant/protected.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Protected(Role.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Protected(Role.ADMIN, Role.PIMPINAN)
  findAll() {
    return this.usersService.findAll();
  }

  // Harus di atas rute berparameter (/:id) agar tidak tertelan.
  @Get('penyusun')
  @Protected(Role.ADMIN, Role.PIMPINAN, Role.PENJAMIN_MUTU)
  findPenyusun(@Query('programStudiId') programStudiId?: string) {
    return this.usersService.findPenyusunByProdi(programStudiId ?? '');
  }

  @Patch(':id')
  @Protected(Role.ADMIN, Role.PIMPINAN)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Protected(Role.ADMIN)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
