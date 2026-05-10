import { z } from 'zod/mini';

export const deadCodeEliminationSettingsSchema = z.strictObject({
    enabled: z.boolean()
});

export type DeadCodeEliminationSettings = z.infer<typeof deadCodeEliminationSettingsSchema>;
