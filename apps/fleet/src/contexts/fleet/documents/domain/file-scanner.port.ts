export type FileScanVerdict = {
  /** False when no scanner examined the file. */
  scanned: boolean;
  clean: boolean;
  /** Set when a scanner rejected the file, e.g. the signature it matched. */
  reason?: string;
};

export interface FileScanner {
  scan(filename: string, contentType: string, buffer: Buffer): Promise<FileScanVerdict>;
}

export const FILE_SCANNER = Symbol("FILE_SCANNER");

/**
 * Stands in until a real scanner is wired. It reports that it scanned nothing
 * rather than reporting a clean file, so the caller can decide. With
 * `DOCUMENT_SCAN_REQUIRED=true` the caller refuses the upload, which is what
 * keeps this from becoming a silent claim that files are safe.
 */
export class UnscannedFileScanner implements FileScanner {
  async scan(): Promise<FileScanVerdict> {
    return { scanned: false, clean: false, reason: "no scanner configured" };
  }
}
