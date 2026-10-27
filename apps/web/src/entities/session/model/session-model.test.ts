import { afterEach, describe, expect, it } from 'vitest';

import { resetMockState } from '@/shared/api';

import {
  clearStoredSession,
  getStoredSession,
  hasStoredSession,
  setStoredSession,
} from './session-model';

describe('session-model', () => {
  afterEach(() => {
    resetMockState();
  });

  it('stores, reads, and clears anonymous session in localStorage', () => {
    expect(hasStoredSession()).toBe(false);
    expect(getStoredSession()).toBeNull();

    const session = { id: 'usr-test-1', createdAt: '2026-10-27T10:00:00.000Z' };
    setStoredSession(session);

    expect(hasStoredSession()).toBe(true);
    expect(getStoredSession()).toEqual(session);

    clearStoredSession();
    expect(hasStoredSession()).toBe(false);
  });
});
