import { IsIn, IsInt, Min } from 'class-validator';
import { STORAGE_SOURCES } from '../storage-usage.repository';

export class ReconcileStorageDto {
  @IsIn([...STORAGE_SOURCES])
  source!: string;

  /** The recomputed total for this source, not a change to it. */
  @IsInt()
  @Min(0)
  bytesUsed!: number;
}
