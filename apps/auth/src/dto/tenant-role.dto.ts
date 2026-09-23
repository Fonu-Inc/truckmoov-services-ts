import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class TenantRoleDto {
  @ApiProperty({ example: 'Night dispatcher' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Dispatch and messaging, no fleet changes' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiProperty({ example: ['tenant.dispatch.read', 'tenant.dispatch.manage'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions!: string[];
}

export class AssignCustomRoleDto {
  @ApiProperty({ nullable: true, description: 'A custom role id, or null to return the user to their predefined role' })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  customRoleId!: string | null;
}
