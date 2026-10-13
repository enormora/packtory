import assert from 'node:assert/strict';
import {
    commandLineInterfaceWorkloadSizes,
    workloadSizes,
    type CommandLineInterfaceWorkloadDefinition,
    type CommandLineInterfaceWorkloadSize,
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
        javaScriptFileCount: readNumberField(value, 'javaScriptFileCount'),
        declarationFileCount: readNumberField(value, 'declarationFileCount'),
        sourceMapFileCount: readNumberField(value, 'sourceMapFileCount'),
        maximumImportFanOut: readNumberField(value, 'maximumImportFanOut')
    };
}

function parseCommandLineInterfaceWorkloadDefinition(value: unknown): CommandLineInterfaceWorkloadDefinition {
    assert.ok(isRecord(value), 'CLI workload definition must be an object');

    return {
        packageCount: readNumberField(value, 'packageCount'),
        javaScriptFileCount: readNumberField(value, 'javaScriptFileCount'),
        declarationFileCount: readNumberField(value, 'declarationFileCount'),
        sourceMapFileCount: readNumberField(value, 'sourceMapFileCount'),
        maximumImportFanOut: readNumberField(value, 'maximumImportFanOut')
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

function parseCommandLineInterfaceWorkloadDefinitions(
    value: unknown
): Record<CommandLineInterfaceWorkloadSize, CommandLineInterfaceWorkloadDefinition> {
    assert.ok(isRecord(value), 'CLI workloads must be an object');

    return {
        medium: parseCommandLineInterfaceWorkloadDefinition(value[commandLineInterfaceWorkloadSizes[0]]),
        large: parseCommandLineInterfaceWorkloadDefinition(value[commandLineInterfaceWorkloadSizes[mediumIndex]])
    };
}

function parseThroughputThreshold(value: unknown): ThroughputThreshold {
    assert.ok(isRecord(value), 'Throughput threshold must be an object');

    return {
        medianMilliseconds: readNumberField(value, 'medianMilliseconds')
    };
}

function parseResponsivenessThreshold(value: unknown): ResponsivenessThreshold {
    assert.ok(isRecord(value), 'Responsiveness threshold must be an object');

    return {
        p99Milliseconds: readNumberField(value, 'p99Milliseconds'),
        maximumMilliseconds: readNumberField(value, 'maximumMilliseconds')
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
        commandLineInterfaceWorkloads: parseCommandLineInterfaceWorkloadDefinitions(value.commandLineInterfaceWorkloads)
    };
}

export function parseThresholdsFile(value: unknown): ThresholdsFile {
    assert.ok(isRecord(value), 'Thresholds file must be an object');
    assert.ok(isRecord(value.normalization), 'Thresholds normalization must be an object');
    assert.ok(isRecord(value.throughput), 'Thresholds throughput must be an object');
    assert.ok(isRecord(value.responsiveness), 'Thresholds responsiveness must be an object');
    assert.ok(
        isRecord(value.responsiveness['publish-command-line-interface']),
        'publish-command-line-interface responsiveness threshold must be an object'
    );

    const publishCommandLineInterfaceThresholds = value.responsiveness['publish-command-line-interface'];

    return {
        normalization: {
            baselineMilliseconds: readNumberField(value.normalization, 'baselineMilliseconds')
        },
        throughput: {
            'build-artifacts': parseThroughputThresholds(value.throughput['build-artifacts']),
            'resolve-and-link': parseThroughputThresholds(value.throughput['resolve-and-link'])
        },
        responsiveness: {
            'publish-command-line-interface': {
                intervalMilliseconds: readNumberField(publishCommandLineInterfaceThresholds, 'intervalMilliseconds'),
                medium: parseResponsivenessThreshold(publishCommandLineInterfaceThresholds.medium),
                large: parseResponsivenessThreshold(publishCommandLineInterfaceThresholds.large)
            }
        }
    };
}
