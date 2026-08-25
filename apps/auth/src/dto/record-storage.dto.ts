import { IsIn, IsInt, IsString } from 'class-validator';
import { STORAGE_SOURCES } from '../storage-usage.repository';

export class RecordStorageDto {
  @IsIn([...STORAGE_SOURCES])
  source!: string;

  /** Positive when a file is stored, negative when one is removed. */
  @IsInt()
  deltaBytes!: number;

  @IsString()
  reference!: string;
}
