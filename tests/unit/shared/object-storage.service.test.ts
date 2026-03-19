import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectStorageService } from "../../../libs/shared/object-storage/src/object-storage.service";

const { sendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = sendMock;
  }

  class PutObjectCommand {
    constructor(readonly input: unknown) {}
  }

  class GetObjectCommand {
    constructor(readonly input: unknown) {}
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

describe("ObjectStorageService", () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
  });

  it("stores public objects in the public bucket when configured", async () => {
    const service = new ObjectStorageService({
      objectStorage: {
        provider: "wasabi",
        region: "eu-west-1",
        endpoint: "https://s3.eu-west-1.wasabisys.com",
        bucket: "truckmoov-private",
        publicBucket: "truckmoov-public",
        accessKey: "key",
        secretKey: "secret",
        forcePathStyle: false,
        publicBaseUrl: "https://truckmoov-public.s3.eu-west-1.wasabisys.com",
        prefix: "dev",
      },
    } as never);

    await service.putObject({
      key: "auth/media/logo.png",
      body: Buffer.from("png"),
      contentType: "image/png",
      visibility: "public",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].input).toMatchObject({
      Bucket: "truckmoov-public",
      Key: "dev/auth/media/logo.png",
      ContentType: "image/png",
    });
  });

  it("builds stable public URLs from the configured public base url", () => {
    const service = new ObjectStorageService({
      objectStorage: {
        provider: "wasabi",
        region: "eu-west-1",
        endpoint: "https://s3.eu-west-1.wasabisys.com",
        bucket: "truckmoov-private",
        publicBucket: "truckmoov-public",
        accessKey: "key",
        secretKey: "secret",
        forcePathStyle: false,
        publicBaseUrl: "https://cdn.truckmoov.com/",
        prefix: "dev",
      },
    } as never);

    expect(service.hasPublicBaseUrl()).toBe(true);
    expect(service.publicUrl("auth/media/logo.png")).toBe(
      "https://cdn.truckmoov.com/dev/auth/media/logo.png",
    );
  });
});
