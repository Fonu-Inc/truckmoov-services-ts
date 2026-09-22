import { describe, expect, it } from "vitest";
import {
  InvalidDocumentFileError,
  inspectDocumentFile,
  sanitizeDocumentName,
  sniffDocumentFormat,
  validateDocumentType,
} from "@auth/onboarding/domain/onboarding-document-file";

const PDF = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

function file(buffer: Buffer, originalname: string, mimetype = "application/octet-stream") {
  return { originalname, mimetype, size: buffer.byteLength, buffer };
}

describe("Document format sniffing", () => {
  it("identifies the three accepted formats from their leading bytes", () => {
    expect(sniffDocumentFormat(PDF)).toBe("pdf");
    expect(sniffDocumentFormat(JPEG)).toBe("jpeg");
    expect(sniffDocumentFormat(PNG)).toBe("png");
  });

  it("rejects a file whose contents are not PDF, JPG or PNG", () => {
    for (const buffer of [
      Buffer.from("PK docx payload"),
      Buffer.from("<html><body>not a document</body></html>"),
      Buffer.from([0x00, 0x01, 0x02, 0x03]),
      Buffer.alloc(0),
    ]) {
      expect(() => sniffDocumentFormat(buffer)).toThrow(InvalidDocumentFileError);
    }
  });
});

describe("Document inspection", () => {
  it("returns the sniffed mime type rather than the declared one", () => {
    const inspected = inspectDocumentFile(
      "utility_bill",
      file(PNG, "bill.png", "application/pdf"),
    );
    expect(inspected.mimeType).toBe("image/png");
    expect(inspected.format).toBe("png");
  });

  it("rejects a payload disguised by its extension and mime type", () => {
    expect(() =>
      inspectDocumentFile(
        "utility_bill",
        file(Buffer.from("PKevil"), "invoice.pdf", "application/pdf"),
      ),
    ).toThrow(InvalidDocumentFileError);
  });

  it("rejects a real PDF sent under an image file name", () => {
    expect(() =>
      inspectDocumentFile("utility_bill", file(PDF, "scan.png")),
    ).toThrow(/does not match/);
  });

  it("accepts both jpg and jpeg for a JPEG file", () => {
    expect(inspectDocumentFile("signature_card", file(JPEG, "card.jpg")).format).toBe("jpeg");
    expect(inspectDocumentFile("signature_card", file(JPEG, "card.jpeg")).format).toBe("jpeg");
  });

  it("requires the customer request letter to be a PDF", () => {
    expect(() =>
      inspectDocumentFile("customer_request_letter", file(JPEG, "letter.jpg")),
    ).toThrow(/must be supplied as a PDF/);
    expect(
      inspectDocumentFile("customer_request_letter", file(PDF, "letter.pdf")).format,
    ).toBe("pdf");
  });

  it("rejects a missing file and one over 10MB", () => {
    expect(() => inspectDocumentFile("utility_bill", undefined)).toThrow(
      /Missing upload file/,
    );
    const oversized = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    expect(() =>
      inspectDocumentFile("utility_bill", file(oversized, "big.pdf")),
    ).toThrow(/10MB or smaller/);
  });
});

describe("Document type", () => {
  it("accepts the ten document types from the upload screen", () => {
    expect(validateDocumentType("cac_document")).toBe("cac_document");
    expect(validateDocumentType(" form_c02_c07 ")).toBe("form_c02_c07");
  });

  it("rejects legacy KYC document types and unknown values", () => {
    for (const input of ["certificate_of_incorporation", "other", "", null]) {
      expect(() => validateDocumentType(input)).toThrow(InvalidDocumentFileError);
    }
  });
});

describe("Document name sanitising", () => {
  it("strips path traversal and unsafe characters but keeps the extension", () => {
    expect(sanitizeDocumentName("../../etc/passwd.pdf", ".pdf")).toBe("etc-passwd.pdf");
    expect(sanitizeDocumentName("utility bill (jan).pdf", ".pdf")).toBe("utility bill -jan.pdf");
  });

  it("falls back to a default name when nothing usable is left", () => {
    expect(sanitizeDocumentName("???.png", ".png")).toBe("document.png");
  });
});
