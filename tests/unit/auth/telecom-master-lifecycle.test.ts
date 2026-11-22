import { describe, expect, it } from 'vitest';
import {
  initialTelecomMasterStatus,
  normalizeMtnNumber,
  resolveTransition,
} from '../../../apps/auth/src/telecom-master.use-cases';

describe('telecom master lifecycle', () => {
  it('starts an existing number in verification and a new one in allocation', () => {
    expect(initialTelecomMasterStatus('existing')).toBe('pending_verification');
    expect(initialTelecomMasterStatus('new')).toBe('allocation_pending');
  });

  it('only lets staff record the outcome that matches the pending step', () => {
    expect(resolveTransition('pending_verification', 'verified')).toBe('verified');
    expect(resolveTransition('pending_verification', 'verification_failed')).toBe('verification_failed');
    expect(resolveTransition('allocation_pending', 'allocated')).toBe('allocated');
    expect(resolveTransition('allocation_pending', 'allocation_failed')).toBe('allocation_failed');
    expect(resolveTransition('pending_verification', 'allocated')).toBeNull();
    expect(resolveTransition('allocated', 'allocation_failed')).toBeNull();
    expect(resolveTransition('verification_failed', 'verified')).toBeNull();
  });

  it('accepts MTN numbers in any common format and rejects others', () => {
    expect(normalizeMtnNumber('0803 123 4567')).toBe('2348031234567');
    expect(normalizeMtnNumber('+234 803 123 4567')).toBe('2348031234567');
    expect(normalizeMtnNumber('08051234567')).toBeNull();
    expect(normalizeMtnNumber('080312345')).toBeNull();
  });
});
