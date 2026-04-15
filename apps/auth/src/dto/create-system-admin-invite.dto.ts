import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class CreateSystemAdminInviteDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}
