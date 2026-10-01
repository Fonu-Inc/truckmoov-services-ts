import { EntitySchema } from '@mikro-orm/core';

export class BillingQuotationRecord {
  id!: string;
  number!: string;
  prefix!: string;
  year!: number;
  sequence!: number;
  applicationId!: string | null;
  tenantId!: string | null;
  planCode!: string;
  deviceCount!: number;
  customerName!: string;
  customerType!: string;
  billingEmail!: string;
  status!: string;
  subtotalKobo!: number;
  discountKobo!: number;
  taxRateBp!: number;
  taxKobo!: number;
  totalKobo!: number;
  validUntil!: Date;
  sentAt!: Date | null;
  acceptedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const BillingQuotationRecordSchema =
  new EntitySchema<BillingQuotationRecord>({
    class: BillingQuotationRecord,
    tableName: 'billing_quotations',
    properties: {
      id: { type: 'string', primary: true, length: 64 },
      number: { type: 'string', length: 32, unique: true },
      prefix: { type: 'string', length: 12 },
      year: { type: 'number' },
      sequence: { type: 'number' },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, nullable: true, index: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, nullable: true },
      planCode: { fieldName: 'plan_code', type: 'string', length: 64 },
      deviceCount: { fieldName: 'device_count', type: 'number' },
      customerName: { fieldName: 'customer_name', type: 'string', length: 200 },
      customerType: { fieldName: 'customer_type', type: 'string', length: 32 },
      billingEmail: { fieldName: 'billing_email', type: 'string', length: 254 },
      status: { type: 'string', length: 20, index: true },
      subtotalKobo: { fieldName: 'subtotal_kobo', type: 'bigint' },
      discountKobo: { fieldName: 'discount_kobo', type: 'bigint' },
      taxRateBp: { fieldName: 'tax_rate_bp', type: 'number' },
      taxKobo: { fieldName: 'tax_kobo', type: 'bigint' },
      totalKobo: { fieldName: 'total_kobo', type: 'bigint' },
      validUntil: { fieldName: 'valid_until', type: 'datetime' },
      sentAt: { fieldName: 'sent_at', type: 'datetime', nullable: true },
      acceptedAt: { fieldName: 'accepted_at', type: 'datetime', nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

export class BillingQuotationLineRecord {
  id!: string;
  quotationId!: string;
  position!: number;
  kind!: string;
  planCode!: string | null;
  name!: string;
  description!: string | null;
  quantity!: number;
  unitPriceKobo!: number;
  validityDays!: number | null;
  components!: unknown;
  isRenewal!: boolean;
}

export const BillingQuotationLineRecordSchema =
  new EntitySchema<BillingQuotationLineRecord>({
    class: BillingQuotationLineRecord,
    tableName: 'billing_quotation_lines',
    properties: {
      id: { type: 'string', primary: true, length: 64 },
      quotationId: { fieldName: 'quotation_id', type: 'string', length: 64, index: true },
      position: { type: 'number', default: 0 },
      kind: { type: 'string', length: 20 },
      planCode: { fieldName: 'plan_code', type: 'string', length: 64, nullable: true },
      name: { type: 'string', length: 200 },
      description: { type: 'text', nullable: true },
      quantity: { type: 'number' },
      unitPriceKobo: { fieldName: 'unit_price_kobo', type: 'bigint' },
      validityDays: { fieldName: 'validity_days', type: 'number', nullable: true },
      components: { type: 'json', nullable: true },
      isRenewal: { fieldName: 'is_renewal', type: 'boolean', default: false },
    },
  });
