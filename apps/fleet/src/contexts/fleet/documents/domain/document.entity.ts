export type DocumentType = "pod" | "invoice" | "permit" | "other";
export type EntityType = "job" | "vehicle" | "driver";

export type DocumentProps = {
  id: string;
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  docType: DocumentType;
  key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: Date;
  expiresAt: Date | null;
};

export class Document {
  private constructor(private readonly props: DocumentProps) {}

  static create(props: DocumentProps): Document {
    return new Document(props);
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get entityType() { return this.props.entityType; }
  get entityId() { return this.props.entityId; }
  get docType() { return this.props.docType; }
  get key() { return this.props.key; }
  get filename() { return this.props.filename; }
  get contentType() { return this.props.contentType; }
  get sizeBytes() { return this.props.sizeBytes; }
  get uploadedBy() { return this.props.uploadedBy; }
  get uploadedAt() { return this.props.uploadedAt; }
  get expiresAt() { return this.props.expiresAt; }

  toPrimitives(): DocumentProps {
    return { ...this.props };
  }
}
