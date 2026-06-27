const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const TOP_Y = PAGE_H - MARGIN;
const BOTTOM_Y = MARGIN;

type Op = { x: number; y: number; text: string; size: number; bold: boolean };

export type PdfCell = { text: string; width: number; align?: "left" | "right" };

export class SimplePdf {
  private pages: Op[][] = [[]];
  private y = TOP_Y;

  private current(): Op[] {
    return this.pages[this.pages.length - 1];
  }

  private ensureSpace(needed: number): void {
    if (this.y - needed < BOTTOM_Y) {
      this.pages.push([]);
      this.y = TOP_Y;
    }
  }

  heading(text: string, size = 16): this {
    this.ensureSpace(size + 8);
    this.y -= size;
    this.current().push({ x: MARGIN, y: this.y, text, size, bold: true });
    this.y -= 8;
    return this;
  }

  text(text: string, size = 10): this {
    this.ensureSpace(size + 4);
    this.y -= size;
    this.current().push({ x: MARGIN, y: this.y, text, size, bold: false });
    this.y -= 4;
    return this;
  }

  row(cells: PdfCell[], opts: { size?: number; bold?: boolean } = {}): this {
    const size = opts.size ?? 9;
    this.ensureSpace(size + 4);
    this.y -= size;
    let x = MARGIN;
    for (const cell of cells) {
      const tx = cell.align === "right" ? x + cell.width - textWidth(cell.text, size) : x;
      this.current().push({ x: tx, y: this.y, text: cell.text, size, bold: opts.bold ?? false });
      x += cell.width;
    }
    this.y -= 4;
    return this;
  }

  spacer(h = 8): this {
    this.ensureSpace(h);
    this.y -= h;
    return this;
  }

  toBuffer(): Buffer {
    const objects: string[] = [];
    const pageObjIds: number[] = [];
    const contentObjIds: number[] = [];

    let nextId = 5;
    for (let i = 0; i < this.pages.length; i++) {
      pageObjIds.push(nextId++);
      contentObjIds.push(nextId++);
    }

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjIds.length} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

    this.pages.forEach((ops, i) => {
      const stream = ops
        .map((op) => `BT /${op.bold ? "F2" : "F1"} ${op.size} Tf ${round(op.x)} ${round(op.y)} Td (${escapePdf(op.text)}) Tj ET`)
        .join("\n");
      objects[pageObjIds[i]] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjIds[i]} 0 R >>`;
      objects[contentObjIds[i]] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    });

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
      if (!objects[id]) continue;
      offsets[id] = Buffer.byteLength(pdf, "latin1");
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefStart = Buffer.byteLength(pdf, "latin1");
    const count = objects.length;
    pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let id = 1; id < count; id++) {
      pdf += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(pdf, "latin1");
  }
}

function escapePdf(text: string): string {
  return asciiOnly(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function asciiOnly(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\x7E]/g, "");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function textWidth(text: string, size: number): number {
  return asciiOnly(text).length * size * 0.5;
}
