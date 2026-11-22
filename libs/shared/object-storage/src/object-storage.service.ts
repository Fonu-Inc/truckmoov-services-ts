import { Inject, Injectable } from "@nestjs/common";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
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

  /**
   * Removes an object.
   *
   * Until this existed, deleting a record left its bytes in the bucket for
   * ever: the tenant saw the file disappear, the storage bill did not. Deleting
   * an object that is already gone is not an error, so a repeated delete is
   * safe.
   */
  /**
   * Total bytes stored under a prefix.
   *
   * Used to recompute a subtotal where object storage is the only record of
   * what was stored. Pages through the listing, because a bucket returns at
   * most a thousand keys per call and a silent truncation would report a total
   * that is quietly too low.
   */
  async totalBytesUnder(prefix: string, visibility: "private" | "public" = "private"): Promise<number> {
    const bucket = this.resolveBucket(visibility);
    let continuationToken: string | undefined;
    let total = 0;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: this.buildKey(prefix),
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of page.Contents ?? []) total += object.Size ?? 0;
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return total;
  }

  async deleteObject(key: string, visibility: "private" | "public" = "private"): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.resolveBucket(visibility),
        Key: this.buildKey(key),
      }),
    );
  }

  /**
   * The stored bytes.
   *
   * Buffered rather than streamed: callers read whole documents that are
   * already bounded at upload, and a stream would push that bound out to every
   * one of them.
   */
  async getObject(
    key: string,
    visibility: "private" | "public" = "private",
  ): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.resolveBucket(visibility),
        Key: this.buildKey(key),
      }),
    );

    const body = response.Body;
    if (!body) throw new Error(`Object ${key} has no content`);

    return Buffer.from(await body.transformToByteArray());
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
      ResponseContentType: input.responseContentType,
      ResponseContentDisposition: input.responseContentDisposition,
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
