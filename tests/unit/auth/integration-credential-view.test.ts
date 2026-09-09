import { describe, expect, it } from 'vitest';
import {
  toIntegrationCredentialView,
  unconfiguredIntegrationCredentialView,
  type StoredPlatformIntegrationCredential,
} from '../../../apps/auth/src/platform-integration-credentials.repository';

function stored(
  overrides: Partial<StoredPlatformIntegrationCredential> = {},
): StoredPlatformIntegrationCredential {
  return {
    serviceKey: 'openrouter',
    category: 'ai',
    enabled: true,
    secretCiphertext: 'cipher-text',
    secretPreview: '...4f2a',
    config: {},
    status: 'degraded',
    lastTestedAt: null,
    lastError: null,
    updatedAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('Integration credential view', () => {
  // The whole point of the view: the key never leaves the server.
  it('never carries the ciphertext', () => {
    expect(toIntegrationCredentialView(stored())).not.toHaveProperty('secretCiphertext');
  });

  it('says a secret is held without revealing it', () => {
    const view = toIntegrationCredentialView(stored());
    expect(view.configured).toBe(true);
    expect(view.secretPreview).toBe('...4f2a');
  });

  it('is not configured when no secret is stored', () => {
    expect(toIntegrationCredentialView(stored({ secretCiphertext: null })).configured).toBe(false);
  });

  // "Nobody has set this up" is a state the settings page renders, so the
  // read answers it rather than 404ing.
  it('describes a service nobody has configured', () => {
    expect(unconfiguredIntegrationCredentialView('openrouter')).toEqual({
      serviceKey: 'openrouter',
      category: null,
      enabled: false,
      secretPreview: null,
      config: {},
      status: 'not_configured',
      lastTestedAt: null,
      lastError: null,
      updatedAt: null,
      configured: false,
    });
  });
});
