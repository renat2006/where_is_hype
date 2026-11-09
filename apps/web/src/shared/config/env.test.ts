import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to real API (apiMocks=false) and /api in production build', () => {
    const result = parseEnv({ PROD: true, MODE: 'production' });
    expect(result.apiBaseUrl).toBe('/api');
    expect(result.apiUrl).toBe('/api');
    expect(result.apiMocks).toBe(false);
  });

  it('reads VITE_API_BASE_URL and strips trailing slash', () => {
    const result = parseEnv({
      VITE_API_BASE_URL: 'http://127.0.0.1:4701/',
      VITE_API_MOCKS: 'false',
    });
    expect(result.apiBaseUrl).toBe('http://127.0.0.1:4701');
    expect(result.apiUrl).toBe('http://127.0.0.1:4701');
    expect(result.apiMocks).toBe(false);
  });

  it('enables mocks only when VITE_API_MOCKS=true', () => {
    const result = parseEnv({
      VITE_API_URL: '/api',
      VITE_API_MOCKS: 'true',
    });
    expect(result.apiMocks).toBe(true);
  });
});
