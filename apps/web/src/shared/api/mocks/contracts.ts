import {
  locationSchema,
  MAX_NOTE_LENGTH,
  platformSchema,
  SHORTLIST_MAX_PLACES,
  visitExpectationSchema,
} from '@where-is-hype/core';
import { z } from 'zod';

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

export const savePlaceInputSchema = z.object({
  placeId: z.string().min(1),
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
