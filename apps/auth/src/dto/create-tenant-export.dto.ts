import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { TENANT_EXPORT_SCOPES } from '../tenant-data-export.repository';

export class CreateTenantExportDto {
  @ApiProperty({ enum: [...TENANT_EXPORT_SCOPES], description: 'What to export. all bundles every table into one zip.' })
  @IsIn([...TENANT_EXPORT_SCOPES])
  scope!: (typeof TENANT_EXPORT_SCOPES)[number];
}
