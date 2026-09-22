import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PdfSignedAgreementRenderer } from "@auth/onboarding/infrastructure/documents/pdf-signed-agreement.renderer";
import type { SignedAgreement } from "@auth/onboarding/domain/ports/signed-agreement-renderer.port";

// A real one-pixel PNG: the renderer decodes it, so a placeholder will not do.
function signatureImage(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function agreement(
  overrides: Partial<SignedAgreement> = {},
): Promise<SignedAgreement> {
  return {
    title: "Fleet Pro Indemnity Agreement",
    body: ["First clause.", "", "Second clause ".repeat(80)].join("\n"),
    templateVersion: "v1",
    templateHash: "a".repeat(64),
    organizationName: "Arne logistics Ltd",
    applicationReference: "APP-2026-ABCD",
    signerName: "Jane Doe",
    signedAt: new Date("2026-09-22T10:30:00Z"),
    ipAddress: "197.210.0.1",
    signature: { bytes: signatureImage(), mimeType: "image/png" },
    ...overrides,
  };
}

describe("Signed agreement PDF", () => {
  it("renders a readable PDF carrying the signature", async () => {
    const pdf = await new PdfSignedAgreementRenderer().render(await agreement());

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("flows long agreements onto further pages", async () => {
    const long = await agreement({
      body: Array.from({ length: 120 }, (_, index) => `Clause ${index + 1}.`).join(
        "\n",
      ),
    });

    const parsed = await PDFDocument.load(
      await new PdfSignedAgreementRenderer().render(long),
    );
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
});
