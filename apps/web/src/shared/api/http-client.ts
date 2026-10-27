import type { z } from 'zod';

import { env } from '@/shared/config';

interface ApiErrorPayload {
  message?: string;
  code?: string;
  placeId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isZodSchema(value: unknown): value is z.ZodType {
  return (
    isRecord(value) && typeof value.parse === 'function' && ('_def' in value || '_zod' in value)
  );
}

export class ApiError extends Error {
  readonly code?: string;
  readonly placeId?: string;
  readonly data?: unknown;

  constructor(
    readonly status: number,
    readonly path: string,
    message?: string,
    data?: unknown,
  ) {
    super(message ?? `Request to ${path} failed with status ${String(status)}`);
    this.name = 'ApiError';
    this.data = data;

    if (isRecord(data)) {
      if (typeof data.code === 'string') {
        this.code = data.code;
      }
      if (typeof data.placeId === 'string') {
        this.placeId = data.placeId;
      }
    }
  }
}

async function parseErrorResponse(response: Response, path: string): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  let message: string | undefined;
  if (isRecord(payload)) {
    const typed = payload as ApiErrorPayload;
    if (typeof typed.message === 'string' && typed.message.trim().length > 0) {
      message = typed.message;
    }
  }

  return new ApiError(response.status, path, message, payload);
}

async function parseSuccessResponse<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  if (response.status === 204) {
    return schema.parse(undefined);
  }

  const text = await response.text();
  const raw: unknown = text.length > 0 ? JSON.parse(text) : undefined;
  return schema.parse(raw);
}

async function requestWithBody<TSchema extends z.ZodType>(
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  schemaOrBody: unknown,
  bodyOrSchema?: unknown,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  let schema: z.ZodType;
  let body: unknown;

  if (isZodSchema(schemaOrBody)) {
    schema = schemaOrBody;
    body = bodyOrSchema;
  } else if (isZodSchema(bodyOrSchema)) {
    schema = bodyOrSchema;
    body = schemaOrBody;
  } else {
    throw new Error(`A Zod schema is required for ${method} ${path}`);
  }

  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  let serializedBody: BodyInit | undefined = init?.body ?? undefined;
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    serializedBody = JSON.stringify(body);
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    method,
    headers,
    ...(serializedBody !== undefined ? { body: serializedBody } : {}),
  });

  if (!response.ok) {
    throw await parseErrorResponse(response, path);
  }

  return parseSuccessResponse(response, schema as TSchema);
}

export async function apiGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  const response = await fetch(`${env.apiUrl}${path}`, { ...init, method: 'GET', headers });

  if (!response.ok) {
    throw await parseErrorResponse(response, path);
  }

  return parseSuccessResponse(response, schema);
}

export async function apiPost<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  body?: unknown,
  init?: RequestInit,
): Promise<z.infer<TSchema>>;
export async function apiPost<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>>;
export async function apiPost<TSchema extends z.ZodType>(
  path: string,
  schemaOrBody: unknown,
  bodyOrSchema?: unknown,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  return requestWithBody<TSchema>('POST', path, schemaOrBody, bodyOrSchema, init);
}

export async function apiPut<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  body?: unknown,
  init?: RequestInit,
): Promise<z.infer<TSchema>>;
export async function apiPut<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>>;
export async function apiPut<TSchema extends z.ZodType>(
  path: string,
  schemaOrBody: unknown,
  bodyOrSchema?: unknown,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  return requestWithBody<TSchema>('PUT', path, schemaOrBody, bodyOrSchema, init);
}

export async function apiPatch<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  body?: unknown,
  init?: RequestInit,
): Promise<z.infer<TSchema>>;
export async function apiPatch<TSchema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>>;
export async function apiPatch<TSchema extends z.ZodType>(
  path: string,
  schemaOrBody: unknown,
  bodyOrSchema?: unknown,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  return requestWithBody<TSchema>('PATCH', path, schemaOrBody, bodyOrSchema, init);
}

export async function apiDelete(path: string, init?: RequestInit): Promise<void>;
export async function apiDelete<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>>;
export async function apiDelete<TSchema extends z.ZodType>(
  path: string,
  schemaOrInit?: TSchema | RequestInit,
  maybeInit?: RequestInit,
): Promise<z.infer<TSchema> | undefined> {
  const hasSchema = isZodSchema(schemaOrInit);
  const init = hasSchema ? maybeInit : schemaOrInit;

  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    throw await parseErrorResponse(response, path);
  }

  if (hasSchema) {
    return parseSuccessResponse(response, schemaOrInit);
  }

  return undefined;
}
