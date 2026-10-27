import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  apiDelete,
  ApiError,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  enableMocks,
  resetMockState,
} from '@/shared/api';

const itemSchema = z.object({
  id: z.string(),
  value: z.string(),
});

describe('http-client', () => {
  beforeAll(async () => {
    await enableMocks();
  });

  afterEach(() => {
    resetMockState();
  });

  it('supports apiGet, apiPost, apiPut, apiPatch, apiDelete with Zod schemas', async () => {
    const { network } = await import('virtual:msw');
    network.use(
      http.get('*/test-items', () => HttpResponse.json({ id: '1', value: 'get' })),
      http.post('*/test-items', async ({ request }) => {
        const body = (await request.json()) as { value: string };
        return HttpResponse.json({ id: '2', value: body.value }, { status: 201 });
      }),
      http.put('*/test-items/2', async ({ request }) => {
        const body = (await request.json()) as { value: string };
        return HttpResponse.json({ id: '2', value: body.value });
      }),
      http.patch('*/test-items/2', async ({ request }) => {
        const body = (await request.json()) as { value: string };
        return HttpResponse.json({ id: '2', value: body.value });
      }),
      http.delete('*/test-items/2', () => HttpResponse.json({ id: '2', value: 'deleted' })),
    );

    const got = await apiGet('/test-items', itemSchema);
    expect(got).toEqual({ id: '1', value: 'get' });

    const postedSchemaFirst = await apiPost('/test-items', itemSchema, { value: 'post-1' });
    expect(postedSchemaFirst).toEqual({ id: '2', value: 'post-1' });

    const postedBodyFirst = await apiPost('/test-items', { value: 'post-2' }, itemSchema);
    expect(postedBodyFirst).toEqual({ id: '2', value: 'post-2' });

    const putResult = await apiPut('/test-items/2', itemSchema, { value: 'put' });
    expect(putResult).toEqual({ id: '2', value: 'put' });

    const patchResult = await apiPatch('/test-items/2', { value: 'patch' }, itemSchema);
    expect(patchResult).toEqual({ id: '2', value: 'patch' });

    const deleteWithSchema = await apiDelete('/test-items/2', itemSchema);
    expect(deleteWithSchema).toEqual({ id: '2', value: 'deleted' });

    await expect(apiDelete('/test-items/2')).resolves.toBeUndefined();
  });

  it('throws ApiError with status, message and metadata on non-OK responses', async () => {
    const { network } = await import('virtual:msw');
    network.use(
      http.post('*/test-conflict', () =>
        HttpResponse.json(
          {
            message: 'Уже в твоих местах',
            code: 'ALREADY_SAVED',
            placeId: 'zhuk-i-pchela',
          },
          { status: 409 },
        ),
      ),
    );

    await expect(apiPost('/test-conflict', itemSchema, { value: 'x' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      path: '/test-conflict',
      message: 'Уже в твоих местах',
      code: 'ALREADY_SAVED',
      placeId: 'zhuk-i-pchela',
    });

    const fallbackError = new ApiError(500, '/broken');
    expect(fallbackError.message).toBe('Request to /broken failed with status 500');
  });
});
