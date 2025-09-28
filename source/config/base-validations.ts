import { z } from 'zod/mini';

export const nonEmptyStringSchema = z.string().check(z.minLength(1));
