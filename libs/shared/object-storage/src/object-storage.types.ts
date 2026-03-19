export type ObjectStorageConfig = {
  provider: string;
  region: string;
  endpoint: string;
  bucket: string;
  publicBucket?: string;
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
  visibility?: "private" | "public";
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
