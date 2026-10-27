import type { Candidate, Location, Place, SavedPlace, Shortlist, Vote } from '@where-is-hype/core';
import {
  createShortlistExpiresAt,
  detectPlatform,
  distanceM,
  getMoscowDayAndMinutes,
  locationSchema,
  MAX_NOTE_LENGTH,
  placeSchema,
  savedPlaceSchema,
  SHORTLIST_MAX_PLACES,
  shortlistSchema,
  upsertVote,
  VISIT_VERIFICATION_RADIUS_M,
  visitExpectationSchema,
  visitSchema,
} from '@where-is-hype/core';
import { delay, http, HttpResponse, passthrough } from 'msw';
import { z } from 'zod';

import { env } from '@/shared/config';

import {
  analyticsEventInputSchema,
  MOCK_DB_STORAGE_KEY,
  reportPlaceResponseSchema,
  SESSION_STORAGE_KEY,
  sessionSchema,
  VOTER_ID_STORAGE_KEY,
} from './contracts';
import {
  DEMO_RECOGNIZED_LINK,
  DEMO_UNKNOWN_LINK,
  demoSeedPlacesFixture,
  placesFixture,
} from './fixtures';

export const STANDARD_DELAY_RANGE_MS = [300, 800] as const;
export const RESOLVE_LINK_DELAY_MS = 1500;

export const GARDEN_RING_CENTER: Location = { lat: 55.7558, lng: 37.6173 };
export const GARDEN_RING_RADIUS_M = 3200;

const mockDbSchema = z.object({
  session: sessionSchema.nullable().default(null),
  savedPlaces: z.array(savedPlaceSchema).default([]),
  shortlist: shortlistSchema.nullable().default(null),
  sharedShortlists: z.record(z.string(), shortlistSchema).default({}),
  reports: z.array(reportPlaceResponseSchema).default([]),
  events: z.array(analyticsEventInputSchema).default([]),
});

export type MockDbState = z.infer<typeof mockDbSchema>;

let realisticDelaysOverride: boolean | null = null;

export function setMockRealisticDelays(enabled: boolean | null): void {
  realisticDelaysOverride = enabled;
}

export function getStandardDelayMs(randomValue = Math.random()): number {
  const [min, max] = STANDARD_DELAY_RANGE_MS;
  const clamped = Math.max(0, Math.min(0.999999, randomValue));
  return min + Math.floor(clamped * (max - min + 1));
}

async function waitMockDelay(kind: 'standard' | 'resolve' = 'standard'): Promise<void> {
  const useRealistic =
    realisticDelaysOverride ?? (import.meta.env.MODE !== 'test' && !import.meta.env.VITEST);

  if (!useRealistic) {
    await delay(5);
    return;
  }

  const ms = kind === 'resolve' ? RESOLVE_LINK_DELAY_MS : getStandardDelayMs();
  await delay(ms);
}

function createId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${randomPart}`;
}

function createEmptyDb(): MockDbState {
  return {
    session: null,
    savedPlaces: [],
    shortlist: null,
    sharedShortlists: {},
    reports: [],
    events: [],
  };
}

export function readMockState(): MockDbState {
  try {
    const rawDb = window.localStorage.getItem(MOCK_DB_STORAGE_KEY);
    const parsedDb = rawDb ? mockDbSchema.safeParse(JSON.parse(rawDb)) : null;
    const state = parsedDb?.success ? parsedDb.data : createEmptyDb();

    if (!state.session) {
      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (rawSession) {
        const parsedSession = sessionSchema.safeParse(JSON.parse(rawSession));
        if (parsedSession.success) {
          state.session = parsedSession.data;
        }
      }
    }

    return state;
  } catch {
    return createEmptyDb();
  }
}

export function writeMockState(state: MockDbState): void {
  try {
    window.localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(state));
    if (state.session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage write errors in restricted environments
  }
}

export function resetMockState(): void {
  try {
    window.localStorage.removeItem(MOCK_DB_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem(VOTER_ID_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getOrCreateBrowserVoterId(): string {
  try {
    const existing = window.localStorage.getItem(VOTER_ID_STORAGE_KEY);
    if (existing && existing.trim().length > 0) {
      return existing.trim();
    }
    const created = createId('voter');
    window.localStorage.setItem(VOTER_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return createId('voter');
  }
}

export function isInsideGardenRing(location: Location): boolean {
  return distanceM(location, GARDEN_RING_CENTER) <= GARDEN_RING_RADIUS_M;
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').trim();
}

export function searchPlacesInFixture(rawQuery: string): Place[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) {
    return [];
  }

  const scored: { place: Place; tier: number; ringRank: number; centerDist: number }[] = [];

  for (const place of placesFixture) {
    const name = normalizeSearchText(place.name);
    const address = normalizeSearchText(place.address);
    const metro = normalizeSearchText(place.metro.name);

    let tier = 0;
    if (name.startsWith(query)) {
      tier = 1;
    } else if (name.includes(query)) {
      tier = 2;
    } else if (address.includes(query) || metro.includes(query)) {
      tier = 3;
    }

    if (tier === 0) {
      continue;
    }

    const ringRank = isInsideGardenRing(place.location) ? 0 : 1;
    const centerDist = distanceM(place.location, GARDEN_RING_CENTER);
    scored.push({ place, tier, ringRank, centerDist });
  }

  scored.sort((a, b) => {
    if (a.ringRank !== b.ringRank) {
      return a.ringRank - b.ringRank;
    }
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }
    return a.centerDist - b.centerDist;
  });

  return scored.map((item) => item.place);
}

function parseLinkWithPath(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname.includes('.')) {
      return null;
    }
    const cleanPath = parsed.pathname.replace(/\/+/g, '').trim();
    if (!cleanPath) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeLinkForCompare(rawUrl: string): string {
  const parsed = parseLinkWithPath(rawUrl);
  if (!parsed) {
    return rawUrl.trim().toLowerCase();
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  return `${host}${path}`;
}

function ensureValidUrlOrNull(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function findPlaceById(id: string): Place | undefined {
  return placesFixture.find((place) => place.id === id);
}

export function resolveLinkCandidates(rawUrl: string): Candidate[] {
  const parsed = parseLinkWithPath(rawUrl);
  if (!parsed) {
    return [];
  }

  const normalized = normalizeLinkForCompare(rawUrl);
  const normalizedDemoRecognized = normalizeLinkForCompare(DEMO_RECOGNIZED_LINK);
  const normalizedDemoUnknown = normalizeLinkForCompare(DEMO_UNKNOWN_LINK);

  if (
    normalized === normalizedDemoUnknown ||
    normalized.includes('private') ||
    normalized.includes('unknown-place') ||
    normalized.includes('/unknown')
  ) {
    return [];
  }

  if (normalized === normalizedDemoRecognized || normalized.includes('hype-coffee')) {
    const first = findPlaceById('zhuk-i-pchela');
    const second = findPlaceById('pokrovka-coffee');
    const third = findPlaceById('zerno');
    return [
      ...(first ? [{ place: first, confidence: 0.95 }] : []),
      ...(second ? [{ place: second, confidence: 0.72 }] : []),
      ...(third ? [{ place: third, confidence: 0.48 }] : []),
    ];
  }

  if (normalized.includes('zs8kq2plm')) {
    const first = findPlaceById('sosny');
    const second = findPlaceById('sosny-pekarnya');
    const third = findPlaceById('zhuk-i-pchela');
    return [
      ...(first ? [{ place: first, confidence: 0.94 }] : []),
      ...(second ? [{ place: second, confidence: 0.68 }] : []),
      ...(third ? [{ place: third, confidence: 0.41 }] : []),
    ];
  }

  const total = placesFixture.length;
  if (total === 0) {
    return [];
  }

  const hash = hashString(normalized);
  const selected: Place[] = [];

  const slugMatch = placesFixture.find((place) => normalized.includes(place.id));
  if (slugMatch) {
    selected.push(slugMatch);
  }

  const offsets = [0, 7, 19, 31];
  for (const offset of offsets) {
    if (selected.length >= 3) {
      break;
    }
    const candidate = placesFixture[(hash + offset) % total];
    if (candidate && !selected.some((item) => item.id === candidate.id)) {
      selected.push(candidate);
    }
  }

  const confidences = [0.91, 0.64, 0.39] as const;
  return selected.slice(0, 3).map((place, index) => ({
    place,
    confidence: confidences[index] ?? 0.35,
  }));
}

function getMoscowDateKey(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const moscowMs = date.getTime() + 3 * 60 * 60 * 1000;
  const moscowDate = new Date(moscowMs);
  const year = String(moscowDate.getUTCFullYear());
  const month = String(moscowDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(moscowDate.getUTCDate()).padStart(2, '0');
  const { dayIndex } = getMoscowDayAndMinutes(date);
  return `${year}-${month}-${day}-${String(dayIndex)}`;
}

function ensureCurrentShortlist(db: MockDbState): Shortlist {
  if (db.shortlist) {
    const shared = db.sharedShortlists[db.shortlist.token];
    if (shared) {
      db.shortlist = {
        ...db.shortlist,
        votes: shared.votes,
      };
    }
    return db.shortlist;
  }

  const createdAt = new Date().toISOString();
  const initial: Shortlist = {
    token: 'evening-demo',
    places: [],
    createdAt,
    expiresAt: createShortlistExpiresAt(createdAt),
    votes: [],
  };
  db.shortlist = initial;
  return initial;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export const handlers = [
  http.get('*/me', async () => {
    await waitMockDelay('standard');
    const db = readMockState();
    return HttpResponse.json(db.session);
  }),

  http.post('*/me', async () => {
    await waitMockDelay('standard');
    const db = readMockState();
    if (db.session) {
      return HttpResponse.json(db.session);
    }

    const session = {
      id: createId('usr'),
      createdAt: new Date().toISOString(),
    };
    db.session = session;
    writeMockState(db);
    return HttpResponse.json(session, { status: 201 });
  }),

  http.get('*/me/places', async () => {
    await waitMockDelay('standard');
    const db = readMockState();
    return HttpResponse.json(db.savedPlaces);
  }),

  http.get('*/places/search', async ({ request }) => {
    await waitMockDelay('standard');
    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    const results = searchPlacesInFixture(query);
    return HttpResponse.json(results);
  }),

  http.get('*/places', async () => {
    await waitMockDelay('standard');
    return HttpResponse.json(placesFixture);
  }),

  http.post('*/links/resolve', async ({ request }) => {
    await waitMockDelay('resolve');
    const body = await readJsonBody(request);
    const url = typeof body.url === 'string' ? body.url : '';
    const candidates = resolveLinkCandidates(url);
    return HttpResponse.json(candidates);
  }),

  http.post('*/me/places', async ({ request }) => {
    await waitMockDelay('standard');
    const body = await readJsonBody(request);
    const db = readMockState();

    let targetPlace: Place | undefined;
    if (typeof body.placeId === 'string') {
      targetPlace = findPlaceById(body.placeId);
    } else if (isRecord(body.place)) {
      const parsedPlace = placeSchema.safeParse(body.place);
      if (parsedPlace.success) {
        targetPlace = findPlaceById(parsedPlace.data.id) ?? parsedPlace.data;
      }
    }

    if (!targetPlace) {
      return HttpResponse.json(
        { message: 'Место не найдено в базе', code: 'PLACE_NOT_FOUND' },
        { status: 404 },
      );
    }

    const rawSourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : null;
    const sourceUrl = ensureValidUrlOrNull(rawSourceUrl);
    const normalizedIncomingUrl = sourceUrl ? normalizeLinkForCompare(sourceUrl) : null;

    const existing = db.savedPlaces.find((item) => {
      if (item.place.id === targetPlace.id) {
        return true;
      }
      if (
        normalizedIncomingUrl &&
        item.sourceUrl &&
        normalizeLinkForCompare(item.sourceUrl) === normalizedIncomingUrl
      ) {
        return true;
      }
      return false;
    });

    if (existing) {
      return HttpResponse.json(
        {
          message: 'Уже в твоих местах',
          code: 'ALREADY_SAVED',
          placeId: existing.place.id,
          savedPlace: existing,
        },
        { status: 409 },
      );
    }

    const rawNote = typeof body.note === 'string' ? body.note : '';
    if (rawNote.length > MAX_NOTE_LENGTH) {
      return HttpResponse.json(
        { message: 'Заметка не длиннее 280 символов', code: 'NOTE_TOO_LONG' },
        { status: 400 },
      );
    }

    const parsedVisits = Array.isArray(body.visits)
      ? z.array(visitSchema).safeParse(body.visits)
      : null;

    const savedPlace: SavedPlace = {
      place: targetPlace,
      sourceUrl,
      sourcePlatform: sourceUrl ? detectPlatform(sourceUrl) : 'other',
      note: rawNote,
      addedAt:
        typeof body.addedAt === 'string' && body.addedAt.length > 0
          ? body.addedAt
          : new Date().toISOString(),
      visits: parsedVisits?.success ? parsedVisits.data : [],
    };

    db.savedPlaces = [savedPlace, ...db.savedPlaces];
    writeMockState(db);

    return HttpResponse.json(savedPlace, { status: 201 });
  }),

  http.post('*/me/places/:id/visits', async ({ params, request }) => {
    await waitMockDelay('standard');
    const placeId = String(params.id ?? '');
    const body = await readJsonBody(request);
    const db = readMockState();

    const index = db.savedPlaces.findIndex((item) => item.place.id === placeId);
    const current = index >= 0 ? db.savedPlaces[index] : undefined;
    if (!current) {
      return HttpResponse.json(
        { message: 'Место не найдено в сохранённых', code: 'SAVED_PLACE_NOT_FOUND' },
        { status: 404 },
      );
    }

    const now = new Date();
    const todayKey = getMoscowDateKey(now);
    const alreadyVisitedToday = current.visits.some(
      (visit) => getMoscowDateKey(visit.at) === todayKey,
    );

    if (alreadyVisitedToday) {
      return HttpResponse.json(
        {
          message: 'Не больше одного визита в место за день',
          code: 'VISIT_ALREADY_MARKED_TODAY',
          placeId,
        },
        { status: 409 },
      );
    }

    let verified = false;
    if (typeof body.verified === 'boolean') {
      verified = body.verified;
    } else if (isRecord(body.location)) {
      const parsedLocation = locationSchema.safeParse(body.location);
      if (parsedLocation.success) {
        verified =
          distanceM(parsedLocation.data, current.place.location) <= VISIT_VERIFICATION_RADIUS_M;
      }
    }

    const parsedExpectation = visitExpectationSchema.nullable().safeParse(body.expectation ?? null);
    const comment =
      typeof body.comment === 'string' ? body.comment.slice(0, MAX_NOTE_LENGTH) : null;

    const visit = {
      at: now.toISOString(),
      verified,
      expectation: parsedExpectation.success ? parsedExpectation.data : null,
      comment,
    };

    const updated: SavedPlace = {
      ...current,
      visits: [...current.visits, visit],
    };

    db.savedPlaces[index] = updated;
    writeMockState(db);

    return HttpResponse.json(updated, { status: 201 });
  }),

  http.patch('*/me/places/:id/visits', async ({ params, request }) => {
    await waitMockDelay('standard');
    const placeId = String(params.id ?? '');
    const body = await readJsonBody(request);
    const db = readMockState();

    const index = db.savedPlaces.findIndex((item) => item.place.id === placeId);
    const current = index >= 0 ? db.savedPlaces[index] : undefined;
    if (!current) {
      return HttpResponse.json(
        { message: 'Место не найдено в сохранённых', code: 'SAVED_PLACE_NOT_FOUND' },
        { status: 404 },
      );
    }

    const lastVisitIndex = current.visits.length - 1;
    const lastVisit = lastVisitIndex >= 0 ? current.visits[lastVisitIndex] : undefined;
    if (!lastVisit) {
      return HttpResponse.json(
        { message: 'Визит ещё не отмечен', code: 'VISIT_NOT_FOUND' },
        { status: 400 },
      );
    }

    const parsedExpectation = visitExpectationSchema.nullable().safeParse(body.expectation ?? null);
    if (!parsedExpectation.success) {
      return HttpResponse.json(
        { message: 'Некорректное значение ожиданий', code: 'INVALID_EXPECTATION' },
        { status: 400 },
      );
    }

    const nextComment =
      'comment' in body
        ? typeof body.comment === 'string'
          ? body.comment.slice(0, MAX_NOTE_LENGTH)
          : null
        : lastVisit.comment;

    const updatedVisits = current.visits.map((visit, idx) =>
      idx === lastVisitIndex
        ? {
            ...visit,
            expectation: parsedExpectation.data,
            comment: nextComment,
          }
        : visit,
    );

    const updated: SavedPlace = {
      ...current,
      visits: updatedVisits,
    };

    db.savedPlaces[index] = updated;
    writeMockState(db);

    return HttpResponse.json(updated);
  }),

  http.patch('*/me/places/:id', async ({ params, request }) => {
    await waitMockDelay('standard');
    const placeId = String(params.id ?? '');
    const body = await readJsonBody(request);
    const db = readMockState();

    const index = db.savedPlaces.findIndex((item) => item.place.id === placeId);
    const current = index >= 0 ? db.savedPlaces[index] : undefined;
    if (!current) {
      return HttpResponse.json(
        { message: 'Место не найдено в сохранённых', code: 'SAVED_PLACE_NOT_FOUND' },
        { status: 404 },
      );
    }

    let nextNote = current.note;
    if (typeof body.note === 'string') {
      if (body.note.length > MAX_NOTE_LENGTH) {
        return HttpResponse.json(
          { message: 'Заметка не длиннее 280 символов', code: 'NOTE_TOO_LONG' },
          { status: 400 },
        );
      }
      nextNote = body.note;
    }

    const updated: SavedPlace = {
      ...current,
      note: nextNote,
    };

    db.savedPlaces[index] = updated;
    writeMockState(db);

    return HttpResponse.json(updated);
  }),

  http.delete('*/me/places/:id', async ({ params }) => {
    await waitMockDelay('standard');
    const placeId = String(params.id ?? '');
    const db = readMockState();

    const existing = db.savedPlaces.find((item) => item.place.id === placeId);
    if (!existing) {
      return HttpResponse.json(
        { message: 'Место не найдено в сохранённых', code: 'SAVED_PLACE_NOT_FOUND' },
        { status: 404 },
      );
    }

    db.savedPlaces = db.savedPlaces.filter((item) => item.place.id !== placeId);
    if (db.shortlist) {
      db.shortlist = {
        ...db.shortlist,
        places: db.shortlist.places.filter((place) => place.id !== placeId),
      };
      if (db.sharedShortlists[db.shortlist.token]) {
        db.sharedShortlists[db.shortlist.token] = db.shortlist;
      }
    }

    writeMockState(db);
    return HttpResponse.json({ deletedId: placeId, savedPlace: existing });
  }),

  http.get('*/me/shortlist', async () => {
    await waitMockDelay('standard');
    const db = readMockState();
    const shortlist = ensureCurrentShortlist(db);
    writeMockState(db);
    return HttpResponse.json(shortlist);
  }),

  http.put('*/me/shortlist', async ({ request }) => {
    await waitMockDelay('standard');
    const body = await readJsonBody(request);
    const db = readMockState();
    const current = ensureCurrentShortlist(db);

    let placeIds: string[] = [];
    if (Array.isArray(body.placeIds)) {
      placeIds = body.placeIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      );
    } else if (Array.isArray(body.places)) {
      placeIds = body.places
        .map((item) => (isRecord(item) && typeof item.id === 'string' ? item.id : ''))
        .filter((id) => id.length > 0);
    }

    const uniquePlaceIds = Array.from(new Set(placeIds));
    if (uniquePlaceIds.length > SHORTLIST_MAX_PLACES) {
      return HttpResponse.json(
        { message: 'Уже 5 мест', code: 'SHORTLIST_LIMIT_EXCEEDED' },
        { status: 400 },
      );
    }

    const resolvedPlaces: Place[] = [];
    for (const id of uniquePlaceIds) {
      const fromSaved = db.savedPlaces.find((item) => item.place.id === id)?.place;
      const fromFixture = fromSaved ?? findPlaceById(id);
      if (fromFixture) {
        resolvedPlaces.push(fromFixture);
      }
    }

    const validIds = new Set(resolvedPlaces.map((place) => place.id));
    const filteredVotes = current.votes
      .map((vote) => ({
        ...vote,
        placeIds: vote.placeIds.filter((id) => validIds.has(id)),
      }))
      .filter((vote) => vote.placeIds.length > 0);

    const updated: Shortlist = {
      ...current,
      places: resolvedPlaces,
      votes: filteredVotes,
    };

    db.shortlist = updated;
    if (db.sharedShortlists[updated.token]) {
      db.sharedShortlists[updated.token] = updated;
    }

    writeMockState(db);
    return HttpResponse.json(updated);
  }),

  http.post('*/me/shortlist/share', async () => {
    await waitMockDelay('standard');
    const db = readMockState();
    const current = ensureCurrentShortlist(db);

    const createdAt = new Date().toISOString();
    const token = current.token || createId('sh');
    const shared: Shortlist = {
      ...current,
      token,
      createdAt,
      expiresAt: createShortlistExpiresAt(createdAt),
    };

    db.shortlist = shared;
    db.sharedShortlists[token] = shared;
    writeMockState(db);

    return HttpResponse.json(shared);
  }),

  http.get('*/s/:token', async ({ params, request }) => {
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
      return passthrough();
    }

    await waitMockDelay('standard');
    const token = String(params.token ?? '');
    const db = readMockState();

    const shortlist =
      db.sharedShortlists[token] ?? (db.shortlist?.token === token ? db.shortlist : null);

    if (!shortlist) {
      return HttpResponse.json(
        { message: 'Подборка не найдена', code: 'SHORTLIST_NOT_FOUND' },
        { status: 404 },
      );
    }

    if (new Date(shortlist.expiresAt).getTime() <= Date.now()) {
      return HttpResponse.json(
        { message: 'Ссылка устарела', code: 'SHORTLIST_EXPIRED' },
        { status: 410 },
      );
    }

    return HttpResponse.json(shortlist);
  }),

  http.post('*/s/:token/votes', async ({ params, request }) => {
    await waitMockDelay('standard');
    const token = String(params.token ?? '');
    const body = await readJsonBody(request);
    const db = readMockState();

    const shortlist =
      db.sharedShortlists[token] ?? (db.shortlist?.token === token ? db.shortlist : null);

    if (!shortlist) {
      return HttpResponse.json(
        { message: 'Подборка не найдена', code: 'SHORTLIST_NOT_FOUND' },
        { status: 404 },
      );
    }

    if (new Date(shortlist.expiresAt).getTime() <= Date.now()) {
      return HttpResponse.json(
        { message: 'Ссылка устарела', code: 'SHORTLIST_EXPIRED' },
        { status: 410 },
      );
    }

    const voterId =
      typeof body.voterId === 'string' && body.voterId.trim().length > 0
        ? body.voterId.trim()
        : getOrCreateBrowserVoterId();

    const rawPlaceIds = Array.isArray(body.placeIds)
      ? body.placeIds.filter((id): id is string => typeof id === 'string')
      : typeof body.placeId === 'string'
        ? [body.placeId]
        : [];

    const validPlaceIds = new Set(shortlist.places.map((place) => place.id));
    const placeIds = Array.from(new Set(rawPlaceIds.filter((id) => validPlaceIds.has(id))));

    const name =
      typeof body.name === 'string' && body.name.trim().length > 0
        ? body.name.trim().slice(0, 80)
        : undefined;

    const nextVote: Vote = {
      voterId,
      ...(name !== undefined ? { name } : {}),
      placeIds,
    };

    const updated: Shortlist = {
      ...shortlist,
      votes: upsertVote(shortlist.votes, nextVote),
    };

    db.sharedShortlists[token] = updated;
    if (db.shortlist?.token === token) {
      db.shortlist = updated;
    }

    writeMockState(db);
    return HttpResponse.json(updated);
  }),

  http.post('*/demo/seed', async () => {
    if (!env.apiMocks && import.meta.env.MODE !== 'test' && !import.meta.env.VITEST) {
      return HttpResponse.json(
        { message: 'Демо-данные доступны только в режиме моков', code: 'DEMO_DISABLED' },
        { status: 403 },
      );
    }

    await waitMockDelay('standard');
    const db = readMockState();
    const existingIds = new Set(db.savedPlaces.map((item) => item.place.id));
    const toAdd = demoSeedPlacesFixture.filter((item) => !existingIds.has(item.place.id));

    db.savedPlaces = [...db.savedPlaces, ...toAdd];
    writeMockState(db);

    return HttpResponse.json(db.savedPlaces);
  }),

  http.post('*/reports', async ({ request }) => {
    await waitMockDelay('standard');
    const body = await readJsonBody(request);
    const db = readMockState();

    const rawQuery =
      typeof body.query === 'string'
        ? body.query
        : typeof body.name === 'string'
          ? body.name
          : 'Неизвестное место';

    const report = {
      id: createId('rep'),
      query: rawQuery.trim() || 'Неизвестное место',
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
      createdAt: new Date().toISOString(),
    };

    db.reports = [...db.reports, report];
    writeMockState(db);

    return HttpResponse.json(report, { status: 201 });
  }),

  http.post('*/events', async ({ request }) => {
    const body = await readJsonBody(request);
    const db = readMockState();

    const parsed = analyticsEventInputSchema.safeParse(body);
    if (parsed.success) {
      db.events = [...db.events, parsed.data];
      writeMockState(db);
    }

    return HttpResponse.json({ ok: true }, { status: 201 });
  }),
];
