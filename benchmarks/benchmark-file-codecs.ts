import assert from 'node:assert/strict';
import {
    cliWorkloadSizes,
    workloadSizes,
    type CliWorkloadDefinition,
    type CliWorkloadSize,
    type ResponsivenessThreshold,
    type ThresholdsFile,
    type ThroughputThreshold,
    type WorkloadDefinition,
    type WorkloadsFile,
    type WorkloadSize
} from './benchmark-types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

const mediumIndex = 1;
const largeIndex = 2;

function readNumberField(record: Readonly<Record<string, unknown>>, fieldName: string): number {
    const value = record[fieldName];
    assert.ok(typeof value === 'number', `Expected "${fieldName}" to be a number`);
    return value;
}

function parseWorkloadDefinition(value: unknown): WorkloadDefinition {
    assert.ok(isRecord(value), 'Workload definition must be an object');

    return {
        clusterCount: readNumberField(value, 'clusterCount'),
        packageCount: readNumberField(value, 'packageCount'),
        jsFileCount: readNumberField(value, 'jsFileCount'),
        declarationFileCount: readNumberField(value, 'declarationFileCount'),
        sourceMapFileCount: readNumberField(value, 'sourceMapFileCount'),
        maxImportFanOut: readNumberField(value, 'maxImportFanOut')
    };
}

function parseCliWorkloadDefinition(value: unknown): CliWorkloadDefinition {
    assert.ok(isRecord(value), 'CLI workload definition must be an object');

    return {
        packageCount: readNumberField(value, 'packageCount'),
        jsFileCount: readNumberField(value, 'jsFileCount'),
        declarationFileCount: readNumberField(value, 'declarationFileCount'),
        sourceMapFileCount: readNumberField(value, 'sourceMapFileCount'),
        maxImportFanOut: readNumberField(value, 'maxImportFanOut')
    };
}

function parseWorkloadDefinitions(value: unknown): Record<WorkloadSize, WorkloadDefinition> {
    assert.ok(isRecord(value), 'Workloads must be an object');

    return {
        small: parseWorkloadDefinition(value[workloadSizes[0]]),
        medium: parseWorkloadDefinition(value[workloadSizes[mediumIndex]]),
        large: parseWorkloadDefinition(value[workloadSizes[largeIndex]])
    };
}

function parseCliWorkloadDefinitions(value: unknown): Record<CliWorkloadSize, CliWorkloadDefinition> {
    assert.ok(isRecord(value), 'CLI workloads must be an object');

    return {
        medium: parseCliWorkloadDefinition(value[cliWorkloadSizes[0]]),
        large: parseCliWorkloadDefinition(value[cliWorkloadSizes[mediumIndex]])
    };
}

function parseThroughputThreshold(value: unknown): ThroughputThreshold {
    assert.ok(isRecord(value), 'Throughput threshold must be an object');

    return {
        medianMs: readNumberField(value, 'medianMs')
    };
}

function parseResponsivenessThreshold(value: unknown): ResponsivenessThreshold {
    assert.ok(isRecord(value), 'Responsiveness threshold must be an object');

    return {
        p99Ms: readNumberField(value, 'p99Ms'),
        maxMs: readNumberField(value, 'maxMs')
    };
}

function parseThroughputThresholds(value: unknown): Record<WorkloadSize, ThroughputThreshold> {
    assert.ok(isRecord(value), 'Throughput threshold group must be an object');

    return {
        small: parseThroughputThreshold(value[workloadSizes[0]]),
        medium: parseThroughputThreshold(value[workloadSizes[mediumIndex]]),
        large: parseThroughputThreshold(value[workloadSizes[largeIndex]])
    };
}

export function parseWorkloadsFile(value: unknown): WorkloadsFile {
    assert.ok(isRecord(value), 'Workloads file must be an object');
    assert.ok(typeof value.seedFixture === 'string', 'Workloads file seedFixture must be a string');

    return {
        seedFixture: value.seedFixture,
        workloads: parseWorkloadDefinitions(value.workloads),
        cliWorkloads: parseCliWorkloadDefinitions(value.cliWorkloads)
    };
}

export function parseThresholdsFile(value: unknown): ThresholdsFile {
    assert.ok(isRecord(value), 'Thresholds file must be an object');
    assert.ok(isRecord(value.normalization), 'Thresholds normalization must be an object');
    assert.ok(isRecord(value.throughput), 'Thresholds throughput must be an object');
    assert.ok(isRecord(value.responsiveness), 'Thresholds responsiveness must be an object');
    assert.ok(isRecord(value.responsiveness['publish-cli']), 'publish-cli responsiveness threshold must be an object');

    const publishCliThresholds = value.responsiveness['publish-cli'];

    return {
        normalization: {
            baselineMilliseconds: readNumberField(value.normalization, 'baselineMilliseconds')
        },
        throughput: {
            'build-artifacts': parseThroughputThresholds(value.throughput['build-artifacts']),
            'resolve-and-link': parseThroughputThresholds(value.throughput['resolve-and-link'])
        },
        responsiveness: {
            'publish-cli': {
                intervalMs: readNumberField(publishCliThresholds, 'intervalMs'),
                medium: parseResponsivenessThreshold(publishCliThresholds.medium),
                large: parseResponsivenessThreshold(publishCliThresholds.large)
            }
        }
    };
}
