import assert from 'node:assert/strict';
import type { PerformanceMeasurement, PerformanceThresholds } from './performance-benchmark-types.ts';
import type { BenchmarkCheck } from './benchmark-checks.ts';

type Budget = readonly [name: string, actual: number, maximum: number];
type ScalingBudget = {
    readonly name: string;
    readonly baseline: string;
    readonly current: string;
    readonly maximum: number;
};
export type PerformanceValidation = {
    readonly validate: (measurement: PerformanceMeasurement) => void;
    readonly checkScaling: () => Promise<void>;
};
const diagnosticDecimalPlaces = 2;

function workBudgets(
    measurement: PerformanceMeasurement,
    thresholds: PerformanceThresholds,
    normalizationMultiplier: number
): readonly Budget[] {
    const medians = {
        analysis: thresholds.analysisMedianMilliseconds,
        vendoring: thresholds.vendoringMedianMilliseconds,
        packing: thresholds.packingMedianMilliseconds,
        publishing: thresholds.publishingMedianMilliseconds
    };
    const { metrics } = measurement;
    const elapsed: Budget = [
        'median ms',
        measurement.medianMilliseconds,
        medians[measurement.kind] * normalizationMultiplier
    ];
    if (!metrics.phaseCountersAvailable) {
        return [ elapsed ];
    }
    return [
        elapsed,
        [ 'source read amplification', metrics.sourceReadAmplification, thresholds.maximumSourceReadAmplification ],
        [ 'unreachable source bytes', metrics.unreachableSourceBytes, 0 ],
        [
            'manifest read amplification',
            metrics.manifestReadAmplification,
            thresholds.maximumMetadataReadAmplification
        ],
        [
            'directory read amplification',
            metrics.directoryReadAmplification,
            thresholds.maximumMetadataReadAmplification
        ],
        [ 'inventory payload bytes', metrics.inventoryPayloadBytes, thresholds.maximumInventoryPayloadBytes ],
        [ 'repeated resolution', metrics.repeatedResolutionFraction, thresholds.maximumRepeatedAnalysisFraction ],
        [ 'repeated elimination', metrics.repeatedEliminationFraction, thresholds.maximumRepeatedAnalysisFraction ],
        [ 'repeated integrity', metrics.repeatedIntegrityFraction, thresholds.maximumRepeatedAnalysisFraction ]
    ];
}

function validateMeasurement(
    measurement: PerformanceMeasurement,
    thresholds: PerformanceThresholds,
    multiplier: number,
    writeLine: (message: string) => void
): void {
    const failures = workBudgets(measurement, thresholds, multiplier)
        .filter(function exceedsBudget([ , actual, maximum ]) {
            return !Number.isFinite(actual) || actual > maximum;
        })
        .map(function ([ name, actual, maximum ]) {
            return `${name}: ${actual.toFixed(diagnosticDecimalPlaces)} > ${maximum.toFixed(diagnosticDecimalPlaces)}`;
        });
    writeLine(
        `- ${measurement.name}: median ${
            measurement.medianMilliseconds.toFixed(1)
        }ms, samples ${measurement.sampleCount}`
    );
    for (const failure of failures) {
        writeLine(`  FAIL ${failure}`);
    }
    if (measurement.metrics.phaseCountersAvailable) {
        writeLine([
            `  compiler input bytes ${measurement.metrics.sourceBytesRead}`,
            `elimination parsed bytes ${measurement.metrics.eliminationParsedBytes}`,
            `integrity parsed bytes ${measurement.metrics.integrityParsedBytes}`
        ]
            .join(', '));
    } else {
        writeLine('  native CLI subprocesses: phase counters unavailable');
    }
    assert.equal(failures.length, 0, failures.join('; '));
}

function scalingBudgets(thresholds: PerformanceThresholds): readonly ScalingBudget[] {
    return [
        {
            name: 'unreachable-source-growth',
            baseline: 'compiler-analysis/single-root-control',
            current: 'compiler-analysis/unreachable-sources',
            maximum: thresholds.maximumAnalysisGrowthMultiplier
        },
        {
            name: 'runtime-root-growth',
            baseline: 'compiler-analysis/single-shared-runtime-root',
            current: 'compiler-analysis/shared-runtime-roots',
            maximum: thresholds.maximumAnalysisGrowthMultiplier
        },
        {
            name: 'declaration-root-growth',
            baseline: 'compiler-analysis/single-shared-declaration-root',
            current: 'compiler-analysis/shared-declaration-roots',
            maximum: thresholds.maximumAnalysisGrowthMultiplier
        },
        {
            name: 'shared-package-growth',
            baseline: 'pipeline/shared-folder-single-package',
            current: 'pipeline/shared-source-packages',
            maximum: thresholds.maximumPackageGrowthMultiplier
        },
        {
            name: 'vendor-output-growth',
            baseline: 'vendoring/wide',
            current: 'vendoring/repeated-outputs',
            maximum: thresholds.maximumAnalysisGrowthMultiplier
        },
        {
            name: 'pack-then-validation',
            baseline: 'pipeline/pack-all-vendor-integrity',
            current: 'pipeline/pack-then-dry-run',
            maximum: thresholds.maximumValidationSequenceMultiplier
        },
        {
            name: 'repeated-validation',
            baseline: 'pipeline/dry-run-integrity',
            current: 'pipeline/repeated-dry-run',
            maximum: thresholds.maximumValidationSequenceMultiplier
        }
    ];
}

function commandLineWorkGrowth(
    startup: PerformanceMeasurement,
    pack: PerformanceMeasurement,
    sequence: PerformanceMeasurement
): number {
    const sequenceProcessCount = 2;
    const packingWork = pack.medianMilliseconds - startup.medianMilliseconds;
    const sequenceWork = sequence.medianMilliseconds - sequenceProcessCount * startup.medianMilliseconds;
    assert.ok(packingWork > 0 && sequenceWork > 0, 'CLI work must exceed the measured startup control');
    return sequenceWork / packingWork;
}

async function checkCommandLineSequence(
    measurements: ReadonlyMap<string, PerformanceMeasurement>,
    maximum: number,
    check: BenchmarkCheck,
    writeLine: (message: string) => void
): Promise<void> {
    await check('timing/command-line-sequence', async function () {
        const startup = measurements.get('pipeline/command-line-startup');
        const pack = measurements.get('pipeline/command-line-pack');
        const sequence = measurements.get('pipeline/command-line-sequence');
        if (startup === undefined || pack === undefined || sequence === undefined) {
            writeLine('SKIP timing/command-line-sequence: a required measurement failed');
            return;
        }
        const growth = commandLineWorkGrowth(startup, pack, sequence);
        writeLine([
            `- timing/command-line-sequence: ${growth.toFixed(diagnosticDecimalPlaces)}x`,
            `(budget ${maximum}x), process startup ${startup.medianMilliseconds.toFixed(1)}ms`
        ]
            .join(' '));
        assert.ok(growth <= maximum, `CLI analysis sequence grew ${growth.toFixed(diagnosticDecimalPlaces)}x`);
    });
}

async function checkScaling(
    measurements: ReadonlyMap<string, PerformanceMeasurement>,
    thresholds: PerformanceThresholds,
    check: BenchmarkCheck,
    writeLine: (message: string) => void
): Promise<void> {
    for (const budget of scalingBudgets(thresholds)) {
        await check(`timing/${budget.name}`, async function () {
            const baseline = measurements.get(budget.baseline);
            const current = measurements.get(budget.current);
            if (baseline === undefined || current === undefined) {
                writeLine(`SKIP timing/${budget.name}: a required measurement failed`);
                return;
            }
            assert.ok(baseline.medianMilliseconds > 0);
            const multiplier = current.medianMilliseconds / baseline.medianMilliseconds;
            writeLine(
                `- timing/${budget.name}: ${multiplier.toFixed(diagnosticDecimalPlaces)}x (budget ${budget.maximum}x)`
            );
            assert.ok(
                multiplier <= budget.maximum,
                `${current.name} took ${
                    multiplier.toFixed(diagnosticDecimalPlaces)
                }x ${baseline.name}, budget ${budget.maximum}x`
            );
        });
    }
}

export function createPerformanceValidation(
    thresholds: PerformanceThresholds,
    multiplier: number,
    check: BenchmarkCheck,
    writeLine: (message: string) => void
): PerformanceValidation {
    const measurements = new Map<string, PerformanceMeasurement>();
    return {
        validate(measurement) {
            measurements.set(measurement.name, measurement);
            validateMeasurement(measurement, thresholds, multiplier, writeLine);
        },
        async checkScaling() {
            await checkScaling(measurements, thresholds, check, writeLine);
            await checkCommandLineSequence(
                measurements,
                thresholds.maximumValidationSequenceMultiplier,
                check,
                writeLine
            );
        }
    };
}
