import { z } from 'zod/mini';
import type { WorkMetrics } from './performance-benchmark-types.ts';

const workMetricsSchema: z.ZodMiniType<WorkMetrics> = z.object({
    phaseCountersAvailable: z.boolean(),
    sourceBytesRead: z.number(),
    eliminationParsedBytes: z.number(),
    integrityParsedBytes: z.number(),
    sourceReadAmplification: z.number(),
    unreachableSourceBytes: z.number(),
    manifestReadAmplification: z.number(),
    directoryReadAmplification: z.number(),
    inventoryPayloadBytes: z.number(),
    repeatedResolutionFraction: z.number(),
    repeatedEliminationFraction: z.number(),
    repeatedIntegrityFraction: z.number()
});
const measurementSchema = z.object({ durationMilliseconds: z.number().check(z.gte(0)), metrics: workMetricsSchema });
export type PipelineProcessMeasurement = Readonly<z.infer<typeof measurementSchema>>;

export function parsePipelineMeasurement(value: unknown): PipelineProcessMeasurement {
    return measurementSchema.parse(value);
}
