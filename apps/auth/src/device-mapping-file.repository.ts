export type StoredDeviceMappingFile = {
  id: string;
  tenantId: string;
  fileKey: string;
  rowCount: number;
  errors: Array<{ row: number; field?: string; message: string }> | null;
  createdAt: Date;
};

export interface DeviceMappingFileRepository {
  findById(id: string): Promise<StoredDeviceMappingFile | null>;
  save(file: StoredDeviceMappingFile): Promise<void>;
}

export const DEVICE_MAPPING_FILE_REPOSITORY = Symbol('DEVICE_MAPPING_FILE_REPOSITORY');
