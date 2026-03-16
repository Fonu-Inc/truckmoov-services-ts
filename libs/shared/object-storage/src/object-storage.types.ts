export type ObjectStorageConfig = {
  provider: string;
  region: string;
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  publicBaseUrl?: string;
  prefix?: string;
};

export type PutObjectInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
};

export type GetObjectUrlInput = {
  key: string;
  expiresIn?: number;
};

export type PutObjectUrlInput = {
  key: string;
  contentType?: string;
  expiresIn?: number;
};
