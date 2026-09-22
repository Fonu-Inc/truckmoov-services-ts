import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type {
  SignedAgreement,
  SignedAgreementRenderer,
} from '@auth/onboarding/domain/ports/signed-agreement-renderer.port';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 10;
const LINE_HEIGHT = 15;
const SIGNATURE_BOX_HEIGHT = 90;

@Injectable()
export class PdfSignedAgreementRenderer implements SignedAgreementRenderer {
  async render(agreement: SignedAgreement): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const body = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const writer = new PageWriter(pdf, body, bold);
    writer.heading(agreement.title, 16);
    writer.line(
      `${agreement.organizationName} · application ${agreement.applicationReference}`,
      9,
    );
    writer.gap(12);

    for (const paragraph of agreement.body.split('\n')) {
      if (paragraph.trim().length === 0) {
        writer.gap(6);
        continue;
      }
      writer.paragraph(paragraph);
    }

    writer.signatureBlock(agreement, await embedSignature(pdf, agreement));

    return Buffer.from(await pdf.save());
  }
}

async function embedSignature(
  pdf: PDFDocument,
  agreement: SignedAgreement,
): Promise<{ width: number; height: number; image: Awaited<ReturnType<PDFDocument['embedPng']>> }> {
  const image =
    agreement.signature.mimeType === 'image/png'
      ? await pdf.embedPng(agreement.signature.bytes)
      : await pdf.embedJpg(agreement.signature.bytes);

  // Scaled to fit the signature box, never enlarged past its own size: a small
  // drawn mark blown up to the full width reads as a different signature.
  const maxWidth = 220;
  const maxHeight = 56;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);

  return { image, width: image.width * scale, height: image.height * scale };
}

/** Lays text down the page, starting a new one when the current is full. */
class PageWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly body: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  heading(text: string, size: number): void {
    this.ensure(size + 8);
    this.y -= size;
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y,
      size,
      font: this.bold,
      color: rgb(0.1, 0.1, 0.18),
    });
    this.y -= 8;
  }

  line(text: string, size = BODY_SIZE, font = this.body): void {
    this.ensure(LINE_HEIGHT);
    this.y -= LINE_HEIGHT;
    this.page.drawText(text, {
      x: MARGIN,
      y: this.y,
      size,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  paragraph(text: string): void {
    for (const line of this.wrap(text, PAGE_WIDTH - MARGIN * 2)) {
      this.line(line);
    }
    this.gap(6);
  }

  gap(height: number): void {
    this.y -= height;
  }

  signatureBlock(
    agreement: SignedAgreement,
    signature: { width: number; height: number; image: Awaited<ReturnType<PDFDocument['embedPng']>> },
  ): void {
    this.ensure(SIGNATURE_BOX_HEIGHT + signature.height);
    this.gap(16);

    this.line('Signed electronically', BODY_SIZE, this.bold);
    this.gap(4);

    this.y -= signature.height;
    this.page.drawImage(signature.image, {
      x: MARGIN,
      y: this.y,
      width: signature.width,
      height: signature.height,
    });

    this.gap(6);
    this.line(agreement.signerName, BODY_SIZE, this.bold);
    this.line(`Signed at ${agreement.signedAt.toISOString()}`, 9);
    this.line(`Agreement version ${agreement.templateVersion}`, 9);
    // The hash is what proves which wording was agreed to, so it belongs on the
    // page and not only in the database row.
    this.line(`Wording checksum (SHA-256) ${agreement.templateHash}`, 8);
    if (agreement.ipAddress) {
      this.line(`Signed from ${agreement.ipAddress}`, 8);
    }
  }

  private ensure(needed: number): void {
    if (this.y - needed >= MARGIN) return;
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private wrap(text: string, width: number): string[] {
    const lines: string[] = [];
    let current = '';

    for (const word of text.split(/\s+/)) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (this.body.widthOfTextAtSize(candidate, BODY_SIZE) <= width) {
        current = candidate;
        continue;
      }
      if (current.length > 0) lines.push(current);
      current = word;
    }

    if (current.length > 0) lines.push(current);
    return lines;
  }
}
