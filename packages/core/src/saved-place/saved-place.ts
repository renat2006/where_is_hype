import { z } from 'zod';

import { platformSchema } from '../link';
import { placeSchema } from '../place';

export const MAX_NOTE_LENGTH = 280;
export const VISIT_VERIFICATION_RADIUS_M = 200;

export const visitExpectations = ['better', 'as_expected', 'worse'] as const;

export const visitExpectationSchema = z.enum(visitExpectations);
export const expectationSchema = visitExpectationSchema;

export const visitSchema = z.object({
  at: z.string().min(1),
  verified: z.boolean(),
  expectation: visitExpectationSchema.nullable(),
  comment: z.string().max(MAX_NOTE_LENGTH).nullable(),
});

export const savedPlaceSchema = z.object({
  place: placeSchema,
  sourceUrl: z.url().nullable(),
  sourcePlatform: platformSchema,
  note: z.string().max(MAX_NOTE_LENGTH),
  addedAt: z.string().min(1),
  visits: z.array(visitSchema),
});

export type VisitExpectation = z.infer<typeof visitExpectationSchema>;
export type Expectation = VisitExpectation;
export type Visit = z.infer<typeof visitSchema>;
export type SavedPlace = z.infer<typeof savedPlaceSchema>;
