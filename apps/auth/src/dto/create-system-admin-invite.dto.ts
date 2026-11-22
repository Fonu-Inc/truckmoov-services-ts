import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SYSTEM_ROLES } from '@shared/rbac';
import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class CreateSystemAdminInviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: SYSTEM_ROLES, default: 'SYSTEM_ADMIN', description: 'The staff role the invitee joins with' })
  @IsOptional()
  @IsIn([...SYSTEM_ROLES])
  role?: string;
}
