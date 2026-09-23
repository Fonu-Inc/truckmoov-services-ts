import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, MaxLength } from 'class-validator';

export class ScheduleRemovalDto {
  @ApiProperty({ example: 'tenant-123' })
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @ApiProperty({ example: 'tenant.fuel.manage' })
  @IsString()
  @MaxLength(96)
  permission!: string;

  @ApiProperty({ example: '2026-10-15T00:00:00Z', description: 'When the removal takes effect; must be in the future' })
  @IsISO8601()
  effectiveAt!: string;

  @ApiProperty({ example: 'Fuel module withdrawn from this plan' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class StaffRoleDto {
  @ApiProperty({ example: 'GOVERNANCE_OFFICER' })
  @IsString()
  @MaxLength(40)
  role!: string;
}
