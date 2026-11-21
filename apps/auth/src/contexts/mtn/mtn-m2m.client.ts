import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '@shared/config';

export type MtnProductGroup =
  | 'data'
  | 'voice'
  | 'yolo'
  | 'music'
  | 'stream'
  | 'others';

export type MtnProductFrequency =
  | 'daily'
  | 'weekend'
  | 'weekly'
  | 'monthly'
  | 'days'
  | 'otherProducts';

export type MtnProduct = {
  id: string;
  name: string;
  currency: string;
  amount: number;
  bundleCategory?: string;
  subCategory?: string;
  description?: string;
  bundleType?: string;
  bundleValidity?: string;
  bundleValue?: { value?: number; units?: string };
  group: MtnProductGroup;
  frequency: MtnProductFrequency;
};

export type MtnEligibility = {
  eligible: boolean;
  statusCode: string | null;
  statusMessage: string | null;
  transactionId: string;
};

export type MtnSubscription = {
  subscriptionId: string | null;
  providerId: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
  startDate: string | null;
  endDate: string | null;
  autoRenew: boolean | null;
  amountCharged: number | null;
};

export class MtnApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MtnApiError';
  }
}

/**
 * The one client for MTN's M2M product and customer APIs.
 *
 * Every MTN call in the app goes through here — catalogue, eligibility and
 * subscriptions — so the base URL, API-key header, tracing id and error shape
 * cannot drift between callers. It is also the seam to replace when MTN moves
 * from API key to OAuth.
 */
@Injectable()
export class MtnM2mClient {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  /**
   * The M2M catalogue for the configured node. The response groups products by
   * type (data, voice, …) and then by frequency (daily, weekly, monthly, days);
   * this returns one flat list and remembers where each product came from.
   */
  async listProducts(): Promise<MtnProduct[]> {
    const nodeId = this.config.mtn.nodeId.trim();
    if (!nodeId) {
      throw new MtnApiError('MTN_M2M_NODE_ID is not configured', 500);
    }
    const response = await this.get('/v3/products', {
      params: { nodeId },
    });
    return flattenCatalogue(response);
  }

  /** Checks whether one MSISDN may buy a product. A fresh transaction id is used for tracing. */
  async checkEligibility(
    customerId: string,
    productId: string,
  ): Promise<MtnEligibility> {
    const transactionId = randomUUID();
    const nodeId = this.config.mtn.nodeId.trim();
    if (!nodeId) {
      throw new MtnApiError('MTN_M2M_NODE_ID is not configured', 500);
    }
    const response = await this.get(
      `/v3/products/${encodeURIComponent(customerId)}/eligibility/${encodeURIComponent(productId)}`,
      {
        params: {
          transactionId,
          clientTransactionId: transactionId,
          nodeId,
          // The eligibility endpoint rejects the call without both of these.
          viewType: 'checkOffer',
          targetSystem: 'CIS',
        },
        transactionId,
      },
    );
    const payload = (response as Record<string, any> | null) ?? {};
    const body = payload.data ?? payload;
    return {
      // MTN returns the string "true" here, not a boolean.
      eligible:
        payload.eligible === true ||
        payload.eligible === 'true' ||
        body.eligible === true ||
        body.eligible === 'true',
      statusCode: payload.statusCode ?? body.statusCode ?? null,
      statusMessage: payload.statusMessage ?? body.statusMessage ?? null,
      transactionId: payload.transactionId ?? body.transactionId ?? transactionId,
    };
  }

  /** The customer's current subscriptions, flattened from MTN's per-provider map. */
  async listSubscriptions(customerId: string): Promise<MtnSubscription[]> {
    const transactionId = randomUUID();
    const response = await this.get(
      `/v2/customers/${encodeURIComponent(customerId)}/subscriptions`,
      { transactionId },
    );
    const payload = (response as Record<string, any> | null) ?? {};
    const services = payload.services ?? payload.data?.services ?? {};
    const rows: MtnSubscription[] = [];

    for (const [provider, raw] of Object.entries(services ?? {})) {
      if (Array.isArray(raw)) {
        for (const item of raw) rows.push(toSubscription(provider, item));
        continue;
      }
      const service = raw as Record<string, any>;
      const data = service?.data ?? service;
      const list = Array.isArray(data?.subscriptions)
        ? data.subscriptions
        : data?.subscriptionId
          ? [data]
          : [];
      for (const item of list) rows.push(toSubscription(provider, item));
    }

    if (Array.isArray(payload.subscriptions)) {
      for (const item of payload.subscriptions) rows.push(toSubscription(null, item));
    }
    return rows;
  }

  private async get(
    path: string,
    options: {
      params?: Record<string, string>;
      transactionId?: string;
    } = {},
  ): Promise<unknown> {
    const mtn = this.config.mtn;
    if (!mtn.baseUrl.trim()) {
      throw new MtnApiError('MTN_API_BASE_URL is not configured', 500);
    }
    if (!mtn.apiKey.trim()) {
      throw new MtnApiError('MTN_X_API_KEY is not configured', 401);
    }

    const transactionId = options.transactionId ?? randomUUID();
    const url = `${mtn.baseUrl.trim().replace(/\/+$/, '')}${path}`;
    const response = await axios.get(url, {
      headers: {
        'x-api-Key': mtn.apiKey.trim(),
        'x-country-code': mtn.countryCode.trim(),
        transactionId,
        Accept: 'application/json',
      },
      params: options.params,
      timeout: mtn.timeoutMs,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data ?? {});
      throw new MtnApiError(
        `MTN ${path} failed (${response.status}): ${detail.slice(0, 300)}`,
        response.status,
      );
    }
    return response.data;
  }
}

const GROUPS: MtnProductGroup[] = [
  'data',
  'voice',
  'yolo',
  'music',
  'stream',
  'others',
];
const FREQUENCIES: MtnProductFrequency[] = [
  'daily',
  'weekend',
  'weekly',
  'monthly',
  'days',
  'otherProducts',
];

/**
 * Flattens the product catalogue. The live API wraps the groups in `data`;
 * older responses put them at the top level, so both are accepted.
 */
export function flattenCatalogue(response: unknown): MtnProduct[] {
  const root = (response as Record<string, any> | null) ?? {};
  const container = root.data ?? root;
  // The catalogue wraps each product type (data, voice, …) in its own
  // frequency set. A single-type response has no wrapper, so treat it as data.
  const hasGroups = GROUPS.some((group) => Boolean(container?.[group]));
  const groups: Record<string, any> = hasGroups
    ? container
    : { data: container };

  const products = new Map<string, MtnProduct>();
  for (const group of GROUPS) {
    const frequencySet = groups?.[group];
    if (!frequencySet) continue;
    for (const frequency of FREQUENCIES) {
      const list = frequencySet?.[frequency];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const product = toProduct(raw, group, frequency);
        if (product) products.set(product.id, product);
      }
    }
  }

  if (Array.isArray(container)) {
    for (const raw of container) {
      const product = toProduct(raw, 'data', 'days');
      if (product) products.set(product.id, product);
    }
  }

  if (Array.isArray(container?.products)) {
    for (const raw of container.products) {
      const product = toProduct(raw, 'others', 'days');
      if (product) products.set(product.id, product);
    }
  }

  if (Array.isArray(container?.data)) {
    for (const raw of container.data) {
      const product = toProduct(raw, 'data', 'days');
      if (product) products.set(product.id, product);
    }
  }

  return [...products.values()];
}

function toProduct(
  raw: Record<string, any>,
  group: MtnProductGroup,
  frequency: MtnProductFrequency,
): MtnProduct | null {
  const id = String(raw?.id ?? '').trim();
  const name = String(raw?.name ?? '').trim();
  const amount = Number(raw?.amount ?? raw?.price);
  if (!id || !name || !Number.isFinite(amount) || amount <= 0) return null;

  const units = raw?.bundleValue?.units ?? raw?.bundleValue?.unit;
  const value = Number(raw?.bundleValue?.value);
  return {
    id,
    name,
    currency: String(raw?.currency ?? 'NGN').trim().toUpperCase() || 'NGN',
    amount,
    bundleCategory: raw?.bundleCategory,
    subCategory: raw?.subCategory,
    description: raw?.description,
    bundleType: raw?.bundleType,
    bundleValidity: raw?.bundleValidity ?? raw?.bundleValidaty,
    bundleValue:
      Number.isFinite(value) && value > 0
        ? { value, units: typeof units === 'string' ? units : undefined }
        : undefined,
    group,
    frequency,
  };
}

function toSubscription(provider: string | null, raw: Record<string, any>): MtnSubscription {
  return {
    subscriptionId: raw?.subscriptionId ? String(raw.subscriptionId) : null,
    providerId:
      raw?.subscriptionProviderId != null
        ? String(raw.subscriptionProviderId)
        : provider,
    name: raw?.subscriptionName ? String(raw.subscriptionName) : null,
    status: raw?.subscriptionStatus ? String(raw.subscriptionStatus) : null,
    type: raw?.subscriptionType ? String(raw.subscriptionType) : null,
    startDate: raw?.startDate ? String(raw.startDate) : null,
    endDate: raw?.endDate ? String(raw.endDate) : null,
    autoRenew:
      typeof raw?.autoRenew === 'boolean'
        ? raw.autoRenew
        : typeof raw?.['auto-renew'] === 'boolean'
          ? raw['auto-renew']
          : null,
    amountCharged:
      raw?.amountCharged != null && Number.isFinite(Number(raw.amountCharged))
        ? Number(raw.amountCharged)
        : null,
  };
}
