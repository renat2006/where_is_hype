import type { Session } from '@/shared/api';
import { readMockState, SESSION_STORAGE_KEY, sessionSchema } from '@/shared/api';

export function getStoredSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = sessionSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        return parsed.data;
      }
    }
    return readMockState().session;
  } catch {
    return null;
  }
}

export function setStoredSession(session: Session): void {
  try {
    const validated = sessionSchema.parse(session);
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(validated));
  } catch {
    // Ignore storage write errors
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function hasStoredSession(): boolean {
  return getStoredSession() !== null;
}

export { SESSION_STORAGE_KEY, sessionSchema };
export type { Session };
