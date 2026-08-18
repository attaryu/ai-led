import { Module } from '@nestjs/common';
import { ProgramStudiModule } from '../program-studi/program-studi.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ProgramStudiModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
