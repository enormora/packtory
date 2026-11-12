import assert from 'node:assert/strict';
import type { RegistrySettings } from '../source/configuration/registry-settings.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';
import { executeBenchmarkProcess } from './benchmark-process.ts';
import { parsePipelineMeasurement, type PipelineProcessMeasurement } from './pipeline-measurement-codec.ts';
import type { PipelineCase } from './pipeline-workload.ts';
import { performanceBenchmarkMeasuredIterations, performanceBenchmarkWarmupIterations } from './tinybench-defaults.ts';
import { calculatePercentile } from './benchmark-percentiles.ts';
import type { PerformanceMeasurement, PerformanceWorkload } from './performance-benchmark-types.ts';

type PipelineEnvironment = { readonly definition: PerformanceWorkload; readonly registrySettings: RegistrySettings; };
const processTimeoutMilliseconds = 180_000;
const medianPercentile = 0.5;
const kindByMode: Readonly<Record<PipelineCase['mode'], PerformanceMeasurement['kind']>> = {
    analysis: 'analysis',
    folder: 'packing',
    tar: 'packing',
    zip: 'packing',
    batch: 'packing',
    publish: 'publishing',
    'pack-then-publish': 'packing',
    'repeat-publish': 'publishing'
};

async function measurePipeline(
    scenario: PipelineCase,
    environment: PipelineEnvironment
): Promise<PipelineProcessMeasurement> {
    const cwd = await createTemporaryDirectory('packtory-benchmark-pipeline-');
    const worker = new URL('./pipeline-benchmark-process.ts', import.meta.url);
    try {
        return parsePipelineMeasurement(
            await executeBenchmarkProcess({
                worker,
                cwd,
                arguments: [
                    scenario.name,
                    JSON.stringify(environment.registrySettings),
                    JSON.stringify(environment.definition)
                ],
                timeoutMilliseconds: processTimeoutMilliseconds
            })
        );
    } finally {
        await removeDirectory(cwd);
    }
}

function medianSample(samples: readonly PipelineProcessMeasurement[]): PipelineProcessMeasurement {
    const measurements = samples.map(function (sample) {
        return sample.durationMilliseconds;
    });
    const median = calculatePercentile(measurements, medianPercentile);
    const representative = samples.find(function (sample) {
        return sample.durationMilliseconds === median;
    });
    assert.ok(representative !== undefined, 'Missing median pipeline sample');
    return representative;
}

export async function runPackingAndPublishingBenchmark(
    scenario: PipelineCase,
    environment: PipelineEnvironment
): Promise<PerformanceMeasurement> {
    for (let iteration = 0; iteration < performanceBenchmarkWarmupIterations; iteration += 1) {
        await measurePipeline(scenario, environment);
    }
    const samples: PipelineProcessMeasurement[] = [];
    for (let iteration = 0; iteration < performanceBenchmarkMeasuredIterations; iteration += 1) {
        samples.push(await measurePipeline(scenario, environment));
    }
    const representative = medianSample(samples);
    return {
        name: `pipeline/${scenario.name}`,
        kind: kindByMode[scenario.mode],
        medianMilliseconds: representative.durationMilliseconds,
        sampleCount: samples.length,
        metrics: representative.metrics
    };
}
