import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
import {
  PaymentGatewayError,
  type PaymentCallback,
  type ChargeInitiated,
  type ChargeRequest,
  type PaymentGateway,
  type RefundLookup,
  type RefundResult,
  type RefundStatus,
} from './payment-gateway.port';

type PaystackInitializeResponse = {
  status: boolean;
  data?: { authorization_url: string; access_code: string; reference: string };
  message?: string;
};

type PaystackRefundResponse = {
  status: boolean;
  data?: { id?: number | string; status?: string };
  message?: string;
};

type PaystackRefundLookupResponse = {
  status?: boolean;
  data?: PaystackRefundRecord | PaystackRefundRecord[] | null;
  message?: string;
};

type PaystackRefundRecord = { id?: number | string; status?: string };

function refundStatus(value: unknown): RefundStatus {
  if (value === 'processed') return 'processed';
  if (value === 'failed') return 'failed';
  return 'pending';
}

const REFUND_EVENTS = ['refund.pending', 'refund.processed', 'refund.failed'];

const REFUND_TIMEOUT_MS = 15_000;

@Injectable()
export class PaystackGateway implements PaymentGateway {
  readonly name = 'paystack';
  readonly signatureHeader = 'x-paystack-signature';
  private readonly logger = new Logger(PaystackGateway.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.payment.paystackSecretKey);
  }

  async initiateCharge(request: ChargeRequest): Promise<ChargeInitiated> {
    if (!this.isConfigured()) {
      // Not an error: a deployment without keys still lets the rest of the flow
      // be exercised, and the caller decides how to present it.
      this.logger.warn('paystack_not_configured');
      return { reference: request.reference, authorizationUrl: null, provider: this.name };
    }

    const baseUrl = this.config.payment.paystackBaseUrl.replace(/\/+$/, '');
    const { data } = await axios.post<PaystackInitializeResponse>(
      `${baseUrl}/transaction/initialize`,
      {
        email: request.customerEmail,
        amount: request.amountKobo,
        reference: request.reference,
        ...(request.redirectUrl ? { callback_url: request.redirectUrl } : {}),
        metadata: request.metadata ?? {},
      },
      {
        headers: {
          Authorization: `Bearer ${this.config.payment.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      },
    );

    if (!data?.status || !data.data) {
      throw new PaymentGatewayError(this.name, data?.message ?? 'Paystack initialization failed');
    }

    return {
      reference: data.data.reference || request.reference,
      authorizationUrl: data.data.authorization_url,
      provider: this.name,
    };
  }

  async refund(reference: string, amountKobo?: number): Promise<RefundResult> {
    if (!this.isConfigured()) {
      throw new PaymentGatewayError(this.name, 'Paystack is not configured');
    }

    const data = await this.postRefund(reference, amountKobo);

    if (!data?.status) {
      throw new PaymentGatewayError(this.name, data?.message ?? 'Paystack refused the refund');
    }
    const id = data.data?.id;
    return {
      status: refundStatus(data.data?.status),
      providerRefundId: id === undefined ? null : String(id),
    };
  }

  async getRefundStatus(reference: string): Promise<RefundLookup> {
    if (!this.isConfigured()) {
      throw new PaymentGatewayError(this.name, 'Paystack is not configured');
    }
    const baseUrl = this.config.payment.paystackBaseUrl.replace(/\/+$/, '');
    let response: { status: number; data: PaystackRefundLookupResponse | undefined };
    try {
      response = await axios.get<PaystackRefundLookupResponse>(
        `${baseUrl}/refund/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${this.config.payment.paystackSecretKey}` },
          timeout: REFUND_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new PaymentGatewayError(this.name, `Paystack did not answer (${reason})`);
    }
    return this.toLookup(response.status, response.data);
  }

  private toLookup(httpStatus: number, body: PaystackRefundLookupResponse | undefined): RefundLookup {
    if (httpStatus === 404) return { status: 'unknown', providerRefundId: null };
    if (httpStatus >= 400 || !body?.status) {
      throw new PaymentGatewayError(this.name, body?.message ?? `Paystack answered ${httpStatus}`);
    }
    const record = Array.isArray(body.data) ? body.data[0] : body.data;
    if (!record) return { status: 'unknown', providerRefundId: null };
    return {
      status: refundStatus(record.status),
      providerRefundId: record.id === undefined ? null : String(record.id),
    };
  }

  private async postRefund(reference: string, amountKobo?: number): Promise<PaystackRefundResponse | undefined> {
    const baseUrl = this.config.payment.paystackBaseUrl.replace(/\/+$/, '');
    try {
      const { data } = await axios.post<PaystackRefundResponse>(
        `${baseUrl}/refund`,
        { transaction: reference, ...(amountKobo ? { amount: amountKobo } : {}) },
        {
          headers: {
            Authorization: `Bearer ${this.config.payment.paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: REFUND_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );
      return data;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new PaymentGatewayError(this.name, `Paystack did not answer (${reason}). Check the transaction on Paystack before retrying.`);
    }
  }

  verifyCallbackSignature(rawBody: string | Buffer, signature: string | undefined): boolean {
    const secretKey = this.config.payment.paystackSecretKey;
    if (!secretKey || !signature) return false;

    const expected = Buffer.from(
      createHmac('sha512', secretKey).update(rawBody).digest('hex'),
      'hex',
    );
    const provided = Buffer.from(signature, 'hex');
    // Length check first: timingSafeEqual throws on a mismatch rather than
    // returning false, and the length is not the secret.
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  parseCallback(body: Record<string, unknown>): PaymentCallback | null {
    const data = body['data'] as Record<string, unknown> | undefined;
    const event = body['event'];
    if (typeof event === 'string' && REFUND_EVENTS.includes(event)) return this.parseRefund(event, data);
    const reference = typeof data?.['reference'] === 'string' ? data['reference'] : null;
    if (!reference) return null;

    return {
      provider: this.name,
      succeeded: body['event'] === 'charge.success',
      failed: body['event'] === 'charge.failed',
      reference,
      metadata: (data?.['metadata'] as Record<string, unknown>) ?? {},
      amountKobo: Number.isInteger(data?.['amount']) ? (data?.['amount'] as number) : null,
      currency: typeof data?.['currency'] === 'string' ? data['currency'] : null,
      channel: typeof data?.['channel'] === 'string' ? data['channel'] : null,
    };
  }

  private parseRefund(event: string, data: Record<string, unknown> | undefined): PaymentCallback {
    const transaction = data?.['transaction_reference'];
    const reference = typeof transaction === 'string' ? transaction : '';
    const id = data?.['refund_reference'] ?? data?.['id'];
    return {
      provider: this.name,
      succeeded: false,
      reference,
      refund: {
        status: refundStatus(event.slice('refund.'.length)),
        providerRefundId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
      },
      metadata: {},
      amountKobo: null,
      currency: null,
      channel: null,
    };
  }
}
