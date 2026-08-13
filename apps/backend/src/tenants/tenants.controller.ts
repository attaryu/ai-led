import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { Protected } from '../tenant/protected.decorator';
import { CurrentTenant } from '../tenant/current-tenant.decorator';

@ApiTags('tenants')
@ApiBearerAuth()
@Protected()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    if (id !== tenantId) {
      throw new ForbiddenException(
        'Anda tidak berwenang mengakses tenant lain',
      );
    }

    return this.prisma.tenant.findUniqueOrThrow({ where: { id } });
  }
}
