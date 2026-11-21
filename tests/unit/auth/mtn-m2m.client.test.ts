import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  MtnApiError,
  MtnM2mClient,
} from '../../../apps/auth/src/contexts/mtn/mtn-m2m.client';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

const get = vi.mocked(axios.get);

function client(
  apiKey = 'test-key',
  overrides: Partial<{
    baseUrl: string;
    nodeId: string;
    countryCode: string;
  }> = {},
) {
  const config = {
    mtn: {
      baseUrl: 'https://preprod2-nigeria.api.mtn.com',
      apiKey,
      nodeId: 'MTNAPPNXG',
      countryCode: 'NGA',
      productMatch: 'm2m|machine',
      timeoutMs: 1000,
      ...overrides,
    },
  };
  return new MtnM2mClient(config as never);
}

describe('MTN M2M client', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ status: 200, data: {} });
  });

  it('flattens the data catalogue with prices', async () => {
    get.mockResolvedValue({
      status: 200,
      data: {
        statusCode: '0000',
        data: {
          data: {
            monthly: [{
              id: '97',
              name: '1GB Monthly',
              currency: 'NGN',
              amount: 500,
              bundleCategory: 'Data',
              bundleType: 'DataBundle',
              bundleValidity: '30 Days',
              bundleValue: { value: 1, units: 'GB' },
            }],
            daily: [],
          },
          voice: { daily: [] },
        },
      },
    });

    const products = await client().listProducts();

    expect(products).toEqual([{
      id: '97',
      name: '1GB Monthly',
      currency: 'NGN',
      amount: 500,
      bundleCategory: 'Data',
      bundleType: 'DataBundle',
      bundleValidity: '30 Days',
      bundleValue: { value: 1, units: 'GB' },
      group: 'data',
      frequency: 'monthly',
    }]);
    expect(get).toHaveBeenCalledWith(
      'https://preprod2-nigeria.api.mtn.com/v3/products',
      expect.objectContaining({
        params: { nodeId: 'MTNAPPNXG' },
        headers: expect.objectContaining({
          'x-api-Key': 'test-key',
          'x-country-code': 'NGA',
          transactionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      }),
    );
  });

  it('checks eligibility with a generated transaction id', async () => {
    get.mockResolvedValue({
      status: 200,
      data: {
        eligible: 'true',
        statusCode: '0000',
        statusMessage: 'Eligible',
        transactionId: 'tx-1',
      },
    });

    const result = await client().checkEligibility(
      '2349162059567',
      'ECHK_NG_Data_2067',
    );

    expect(result).toEqual({
      eligible: true,
      statusCode: '0000',
      statusMessage: 'Eligible',
      transactionId: 'tx-1',
    });
    expect(get).toHaveBeenCalledWith(
      'https://preprod2-nigeria.api.mtn.com/v3/products/2349162059567/eligibility/ECHK_NG_Data_2067',
      expect.objectContaining({
        params: expect.objectContaining({
          transactionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          clientTransactionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          nodeId: 'MTNAPPNXG',
          viewType: 'checkOffer',
          targetSystem: 'CIS',
        }),
        headers: expect.objectContaining({
          'x-api-Key': 'test-key',
          'x-country-code': 'NGA',
          transactionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      }),
    );
  });

  it('flattens the provider map in a customer subscription response', async () => {
    get.mockResolvedValue({
      status: 200,
      data: {
        customerId: '2349162059746',
        services: {
          CIS: {
            statusCode: '2000',
            data: {
              subscriptions: [{
                subscriptionId: 'sub-1',
                subscriptionProviderId: 'CIS',
                subscriptionName: '1GB Monthly',
                subscriptionStatus: 'Active',
                subscriptionType: 'Recurring',
                startDate: '2026-11-01',
                endDate: '2026-12-01',
                autoRenew: true,
                amountCharged: 500,
              }],
            },
          },
        },
      },
    });

    const subscriptions = await client().listSubscriptions('2349162059746');

    expect(subscriptions).toEqual([{
      subscriptionId: 'sub-1',
      providerId: 'CIS',
      name: '1GB Monthly',
      status: 'Active',
      type: 'Recurring',
      startDate: '2026-11-01',
      endDate: '2026-12-01',
      autoRenew: true,
      amountCharged: 500,
    }]);
    expect(get).toHaveBeenCalledWith(
      'https://preprod2-nigeria.api.mtn.com/v2/customers/2349162059746/subscriptions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-Key': 'test-key',
          'x-country-code': 'NGA',
          transactionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      }),
    );
  });

  it('refuses to call MTN without an API key', async () => {
    await expect(client('').listProducts()).rejects.toBeInstanceOf(MtnApiError);
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses to call MTN without a base URL', async () => {
    await expect(client('test-key', { baseUrl: '  ' }).listProducts())
      .rejects.toBeInstanceOf(MtnApiError);
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses to call MTN without a node id', async () => {
    await expect(client('test-key', { nodeId: '' }).listProducts())
      .rejects.toBeInstanceOf(MtnApiError);
    expect(get).not.toHaveBeenCalled();
  });

  it('trims padding from the API key before sending it', async () => {
    await client('  test-key  ').listProducts();

    expect(get).toHaveBeenCalledWith(
      'https://preprod2-nigeria.api.mtn.com/v3/products',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-Key': 'test-key' }),
      }),
    );
  });

  it('surfaces an MTN error response', async () => {
    get.mockResolvedValue({
      status: 401,
      data: { statusMessage: 'Unauthorised.' },
    });

    await expect(client().listProducts()).rejects.toBeInstanceOf(MtnApiError);
  });
});
