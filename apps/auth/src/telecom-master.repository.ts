export const TELECOM_MASTER_REPOSITORY = Symbol('TELECOM_MASTER_REPOSITORY');

export type TelecomMasterNumberType = 'existing' | 'new';

export type TelecomMasterStatus =
  | 'not_selected'
  | 'pending_verification'
  | 'verified'
  | 'allocation_pending'
  | 'allocated'
  | 'verification_failed'
  | 'allocation_failed';

export type StoredTelecomMasterRequest = {
  id: string;
  tenantId: string | null;
  organizationName: string;
  contactEmail: string;
  applicationId: string | null;
  applicationReference: string;
  msisdn: string | null;
  simSerial: string | null;
  numberType: TelecomMasterNumberType;
  status: TelecomMasterStatus;
  mtnReference: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredTelecomMasterEvent = {
  id: string;
  requestId: string;
  action: string;
  detail: string | null;
  createdAt: Date;
};

export interface TelecomMasterRepository {
  /** Newest first. */
  findAll(): Promise<StoredTelecomMasterRequest[]>;
  findById(id: string): Promise<StoredTelecomMasterRequest | null>;
  save(request: StoredTelecomMasterRequest): Promise<void>;
  /** Oldest first, the order shown in the audit history. */
  findEvents(requestId: string): Promise<StoredTelecomMasterEvent[]>;
  appendEvent(event: StoredTelecomMasterEvent): Promise<void>;
}
