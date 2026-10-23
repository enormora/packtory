import { z } from 'zod/mini';

const unusedSchema = z.object({ value: z.string() });

export function api() {
    return 42;
}
