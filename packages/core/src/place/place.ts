import { z } from 'zod';

export const noiseLevelSchema = z.enum(['quiet', 'moderate', 'loud']);

export const placeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  noiseLevel: noiseLevelSchema,
  entrancePhotoUrl: z.url().nullable(),
});

export type NoiseLevel = z.infer<typeof noiseLevelSchema>;
export type Place = z.infer<typeof placeSchema>;
