import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import {
  MIN_TERMINATION_REASON_LENGTH,
  TERMINATION_CONFIRMATION,
} from '../tenant-termination.repository';

export class TerminateTenantDto {
  @ApiProperty({
    description: 'Why the tenant is being terminated. Recorded permanently in the audit trail.',
    minLength: MIN_TERMINATION_REASON_LENGTH,
  })
  @IsString()
  @MinLength(MIN_TERMINATION_REASON_LENGTH)
  reason!: string;

  @ApiProperty({
    description: `Must be the literal ${TERMINATION_CONFIRMATION}. Checked server-side, so a client that skips the dialog cannot skip the intent it establishes.`,
  })
  @IsString()
  confirmation!: string;
}
