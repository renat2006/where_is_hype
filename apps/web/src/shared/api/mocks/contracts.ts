import type { DayHours, Place, SavedPlace, WeeklyHours } from '@where-is-hype/core';
import {
  dayHoursSchema,
  locationSchema,
  MAX_NOTE_LENGTH,
  placeTypeSchema,
  platformSchema,
  SHORTLIST_MAX_PLACES,
  visitExpectationSchema,
  visitSchema,
} from '@where-is-hype/core';
import { z } from 'zod';

const rawDayHoursSchema: z.ZodType<DayHours | null> = z
  .union([dayHoursSchema, z.array(dayHoursSchema)])
  .nullish()
  .transform((val): DayHours | null => {
    if (!val) {
      return null;
    }
    if (Array.isArray(val)) {
      return val[0] ?? null;
    }
    return val;
  });

const rawWeeklyHoursSchema: z.ZodType<WeeklyHours | null> = z
  .object({
    mon: rawDayHoursSchema,
    tue: rawDayHoursSchema,
    wed: rawDayHoursSchema,
    thu: rawDayHoursSchema,
    fri: rawDayHoursSchema,
    sat: rawDayHoursSchema,
    sun: rawDayHoursSchema,
  })
  .nullish()
  .transform((val): WeeklyHours | null => val ?? null);

const rawMetroSchema = z
  .object({
    name: z.string().nullish(),
    distanceM: z.number().nonnegative().nullish(),
  })
  .nullish()
  .transform((metro) => ({
    name: metro?.name?.trim() ?? '',
    distanceM: typeof metro?.distanceM === 'number' ? metro.distanceM : 0,
  }));

export const apiPlaceSchema: z.ZodType<Place> = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: placeTypeSchema,
    address: z.string().nullish(),
    metro: rawMetroSchema,
    location: locationSchema,
    hours: rawWeeklyHoursSchema,
    avgCheck: z.number().positive().nullish(),
    yandexOrgId: z.string().nullish(),
  })
  .transform((raw): Place => ({
    id: raw.id,
    name: raw.name,
    type: raw.type,
    address: raw.address?.trim() ?? '',
    metro: raw.metro,
    location: raw.location,
    hours: raw.hours ?? null,
    avgCheck: raw.avgCheck ?? null,
    yandexOrgId: raw.yandexOrgId?.trim() ? raw.yandexOrgId.trim() : null,
  }));

export const apiSavedPlaceSchema: z.ZodType<SavedPlace> = z.object({
  place: apiPlaceSchema,
  sourceUrl: z.string().nullable(),
  sourcePlatform: platformSchema,
  note: z.string().max(MAX_NOTE_LENGTH),
  addedAt: z.string().min(1),
  visits: z.array(visitSchema),
});

export const SESSION_STORAGE_KEY = 'where-is-hype:session';
export const VOTER_ID_STORAGE_KEY = 'where-is-hype:voter-id';
export const MOCK_DB_STORAGE_KEY = 'where-is-hype:mock-db:v1';

export const sessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
});

export type Session = z.infer<typeof sessionSchema>;

export const resolveLinkInputSchema = z.object({
  url: z.string(),
});

export type ResolveLinkInput = z.infer<typeof resolveLinkInputSchema>;

export const matchStatusSchema = z.enum(['exact', 'ambiguous', 'chain_ambiguous', 'not_found']);

export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const resolvedCandidateSchema = z.object({
  place: apiPlaceSchema.nullable().default(null),
  confidence: z.number().min(0).max(1).default(0),
  matchStatus: matchStatusSchema.optional(),
  status: matchStatusSchema.optional(),
  rawCategory: z.string().nullish(),
  category: z.string().nullish(),
  extractedName: z.string().nullish(),
  isChain: z.boolean().optional(),
  addressOrMetro: z.string().nullish(),
  evidence: z.string().nullish(),
  evidenceQuote: z.string().nullish(),
  quote: z.string().nullish(),
  reason: z.string().nullish(),
  branchCandidates: z.array(apiPlaceSchema).optional().default([]),
});

export type ResolvedCandidate = z.infer<typeof resolvedCandidateSchema>;

export const savePlaceInputSchema = z.object({
  placeId: z.string().min(1),
  place: apiPlaceSchema.optional(),
  sourceUrl: z.string().nullable().optional(),
  sourcePlatform: platformSchema.optional(),
  note: z.string().max(MAX_NOTE_LENGTH).optional(),
});

export type SavePlaceInput = z.infer<typeof savePlaceInputSchema>;

export const updateNoteInputSchema = z.object({
  placeId: z.string().min(1),
  note: z.string().max(MAX_NOTE_LENGTH),
});

export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

export const markVisitInputSchema = z.object({
  placeId: z.string().min(1),
  location: locationSchema.nullable().optional(),
  verified: z.boolean().optional(),
  expectation: visitExpectationSchema.nullable().optional(),
  comment: z.string().max(MAX_NOTE_LENGTH).nullable().optional(),
});

export type MarkVisitInput = z.infer<typeof markVisitInputSchema>;

export const updateVisitExpectationInputSchema = z.object({
  placeId: z.string().min(1),
  expectation: visitExpectationSchema.nullable(),
  comment: z.string().max(MAX_NOTE_LENGTH).nullable().optional(),
});

export type UpdateVisitExpectationInput = z.infer<typeof updateVisitExpectationInputSchema>;

export const updateShortlistInputSchema = z.object({
  placeIds: z.array(z.string().min(1)).max(SHORTLIST_MAX_PLACES),
});

export type UpdateShortlistInput = z.infer<typeof updateShortlistInputSchema>;

export const submitVoteInputSchema = z.object({
  token: z.string().min(1),
  voterId: z.string().min(1).optional(),
  name: z.string().trim().max(80).optional(),
  placeIds: z.array(z.string().min(1)),
});

export type SubmitVoteInput = z.infer<typeof submitVoteInputSchema>;

export const reportPlaceInputSchema = z.object({
  query: z.string().trim().min(1),
  sourceUrl: z.string().nullable().optional(),
  comment: z.string().max(MAX_NOTE_LENGTH).nullable().optional(),
});

export const reportPlaceResponseSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  sourceUrl: z.string().nullable(),
  createdAt: z.string().min(1),
});

export type ReportPlaceInput = z.infer<typeof reportPlaceInputSchema>;
export type ReportPlaceResponse = z.infer<typeof reportPlaceResponseSchema>;

export const analyticsEventInputSchema = z.object({
  event: z.string().min(1),
  anonymousId: z.string().min(1).optional(),
  timestamp: z.string().min(1).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

export const analyticsEventResponseSchema = z.object({
  ok: z.boolean(),
});

export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;
export type AnalyticsEventResponse = z.infer<typeof analyticsEventResponseSchema>;
