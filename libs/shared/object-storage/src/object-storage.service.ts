import { Inject, Injectable } from "@nestjs/common";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppConfigService } from "@shared/config";
import type {
  GetObjectUrlInput,
  ObjectStorageConfig,
  PutObjectInput,
  PutObjectUrlInput,
} from "./object-storage.types";

@Injectable()
export class ObjectStorageService {
  private readonly client: S3Client;
  private readonly config: ObjectStorageConfig;

  constructor(@Inject(AppConfigService) appConfig: AppConfigService) {
    this.config = appConfig.objectStorage;
    this.client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.forcePathStyle,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<string> {
    const objectKey = this.buildKey(input.key);
    const visibility = input.visibility ?? "private";
    const command: PutObjectCommandInput = {
      Bucket: this.resolveBucket(visibility),
      Key: objectKey,
      Body: input.body,
    };

    if (input.contentType) {
      command.ContentType = input.contentType;
    }

    if (visibility === "public") {
      // Mirror the Fonu upload pattern so the returned stable URL is directly
      // readable even when the bucket relies on object ACLs for public access.
      command.ACL = "public-read";
    }

    await this.client.send(new PutObjectCommand(command));

    return objectKey;
  }

  async createPresignedUploadUrl(input: PutObjectUrlInput): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: this.buildKey(input.key),
      ContentType: input.contentType,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: input.expiresIn ?? 900,
    });
  }

  async createPresignedDownloadUrl(input: GetObjectUrlInput): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: this.buildKey(input.key),
    });

    return getSignedUrl(this.client, command, {
      expiresIn: input.expiresIn ?? 900,
    });
  }

  publicUrl(key: string): string | null {
    if (!this.config.publicBaseUrl) {
      return null;
    }

    const baseUrl = this.config.publicBaseUrl.replace(/\/+$/, "");
    return `${baseUrl}/${this.buildKey(key)}`;
  }

  hasPublicBaseUrl(): boolean {
    return Boolean(this.config.publicBaseUrl);
  }

  private buildKey(key: string): string {
    const normalizedKey = key.replace(/^\/+/, "");
    const prefix = (this.config.prefix ?? "").replace(/^\/+|\/+$/g, "");

    if (!prefix) {
      return normalizedKey;
    }

    return `${prefix}/${normalizedKey}`;
  }

  private resolveBucket(visibility: "private" | "public" = "private"): string {
    if (visibility === "public") {
      return this.config.publicBucket || this.config.bucket;
    }

    return this.config.bucket;
  }
}
