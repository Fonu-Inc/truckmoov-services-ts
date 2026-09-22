import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  EXTRACTION_FIELDS,
  type DocumentExtraction,
  type DocumentExtractor,
  type DocumentToExtract,
  type ExtractedField,
  type ExtractionField,
} from '@auth/onboarding/domain/ports/document-extraction.port';

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * The self-hosted PaddleOCR service.
 *
 * Self-hosted rather than a cloud vendor because the documents are CAC
 * certificates, government IDs and utility bills: keeping them inside our own
 * infrastructure is the point, not a cost saving.
 *
 * An unreachable service returns an empty extraction rather than throwing. An
 * extraction can only contradict a registry answer or support one, so its
 * absence must leave a decision exactly where it would have been without it.
 */
@Injectable()
export class HttpDocumentExtractor implements DocumentExtractor {
  private readonly logger = new Logger(HttpDocumentExtractor.name);

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async extract(document: DocumentToExtract): Promise<DocumentExtraction> {
    const { serviceUrl, authToken } = this.config.documentExtraction;
    if (!serviceUrl) return this.empty(document, 'not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${serviceUrl.replace(/\/+$/, '')}/extract`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            documentId: document.documentId,
            documentType: document.documentType,
            mimeType: document.mimeType,
            contentBase64: document.bytes.toString('base64'),
          }),
        },
      );

      if (!response.ok) {
        return this.empty(document, `responded ${response.status}`);
      }
      return this.parse(document, await response.json());
    } catch (error) {
      return this.empty(
        document,
        error instanceof Error ? error.message : 'unknown error',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private parse(document: DocumentToExtract, body: unknown): DocumentExtraction {
    const payload = (body ?? {}) as {
      engine?: unknown;
      engineVersion?: unknown;
      fields?: unknown;
    };

    const fields = Array.isArray(payload.fields)
      ? payload.fields.flatMap((entry) => this.parseField(entry))
      : [];

    return {
      documentId: document.documentId,
      documentType: document.documentType,
      fields,
      engine: typeof payload.engine === 'string' ? payload.engine : 'unknown',
      engineVersion:
        typeof payload.engineVersion === 'string'
          ? payload.engineVersion
          : 'unknown',
      extractedAt: new Date(),
    };
  }

  private parseField(entry: unknown): ExtractedField[] {
    const candidate = (entry ?? {}) as {
      field?: unknown;
      value?: unknown;
      confidence?: unknown;
    };

    // A field name this service does not recognise is dropped rather than
    // carried: the decision logic matches on the known set, and an unknown
    // name would sit in the record looking like evidence of something.
    if (
      typeof candidate.field !== 'string' ||
      !(EXTRACTION_FIELDS as readonly string[]).includes(candidate.field)
    ) {
      return [];
    }

    const confidence =
      typeof candidate.confidence === 'number' &&
      Number.isFinite(candidate.confidence)
        ? Math.min(Math.max(candidate.confidence, 0), 1)
        : 0;

    return [
      {
        field: candidate.field as ExtractionField,
        value: typeof candidate.value === 'string' ? candidate.value : null,
        confidence,
      },
    ];
  }

  private empty(document: DocumentToExtract, reason: string): DocumentExtraction {
    this.logger.warn(
      `document_extraction_unavailable:${document.documentId}:${reason}`,
    );
    return {
      documentId: document.documentId,
      documentType: document.documentType,
      fields: [],
      engine: 'none',
      engineVersion: reason,
      extractedAt: new Date(),
    };
  }
}
