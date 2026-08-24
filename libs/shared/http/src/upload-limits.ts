// Every multipart endpoint buffers the upload in memory before the handler
// sees it. Without an explicit limit Multer accepts a body of any size, so the
// cap is what stops one request exhausting the process.
export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_IMPORT_BYTES = 5 * 1024 * 1024;

export function uploadLimits(maxBytes: number) {
  return { limits: { fileSize: maxBytes, files: 1 } };
}
