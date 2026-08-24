import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
import {
  PaymentGatewayError,
  type ChargeInitiated,
  type ChargeRequest,
  type PaymentGateway,
} from './payment-gateway.port';

type PaystackInitializeResponse = {
  status: boolean;
  data?: { authorization_url: string; access_code: string; reference: string };
  message?: string;
};

@Injectable()
export class PaystackGateway implements PaymentGateway {
  readonly name = 'paystack';
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
}
