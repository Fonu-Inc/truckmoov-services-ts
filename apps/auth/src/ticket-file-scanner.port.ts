/**
 * A ticket attachment arrives from outside the platform's trust boundary, the
 * same as any tenant document upload, so it goes through the same kind of
 * check fleet already applies to its own document uploads.
 */
export type TicketFileScanVerdict = {
  /** False when no scanner examined the file. */
  scanned: boolean;
  clean: boolean;
  reason?: string;
};

export interface TicketFileScanner {
  scan(filename: string, contentType: string, buffer: Buffer): Promise<TicketFileScanVerdict>;
}

export const TICKET_FILE_SCANNER = Symbol('TICKET_FILE_SCANNER');

/**
 * Stands in until a real scanner is wired. Reports that it scanned nothing
 * rather than claiming a file is clean, so DOCUMENT_SCAN_REQUIRED decides
 * whether that is acceptable — the same policy fleet's document uploads use.
 */
export class UnscannedTicketFileScanner implements TicketFileScanner {
  async scan(): Promise<TicketFileScanVerdict> {
    return { scanned: false, clean: false, reason: 'no scanner configured' };
  }
}

/** Why an upload is refused, or null when it may be kept. A file nobody examined is refused when scanning is required. */
export function scanRefusal(verdict: TicketFileScanVerdict, scanRequired: boolean): string | null {
  if (verdict.scanned && !verdict.clean) return verdict.reason ?? 'flagged by scanner';
  if (!verdict.scanned && scanRequired) return verdict.reason ?? 'scanning is required but unavailable';
  return null;
}
