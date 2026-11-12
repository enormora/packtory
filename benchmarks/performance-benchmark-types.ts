import type { TinybenchMeasurement } from './benchmark-types.ts';

export type PerformanceWorkload = {
    readonly sourceFileCount: number;
    readonly exportsPerFile: number;
    readonly entryPointCount: number;
    readonly integrityPackageCount: number;
    readonly deadExportsPerFile: number;
    readonly dependencyCount: number;
    readonly filesPerDependency: number;
    readonly payloadBytes: number;
};

export type PerformanceThresholds = {
    readonly maximumAnalysisGrowthMultiplier: number;
    readonly maximumPackageGrowthMultiplier: number;
    readonly maximumValidationSequenceMultiplier: number;
    readonly maximumSourceReadAmplification: number;
    readonly maximumMetadataReadAmplification: number;
    readonly maximumInventoryPayloadBytes: number;
    readonly maximumRepeatedAnalysisFraction: number;
    readonly maximumAdditionalResidentMiB: number;
    readonly analysisMedianMilliseconds: number;
    readonly vendoringMedianMilliseconds: number;
    readonly packingMedianMilliseconds: number;
    readonly publishingMedianMilliseconds: number;
};

export type WorkMetrics = {
    readonly phaseCountersAvailable: boolean;
    readonly sourceBytesRead: number;
    readonly eliminationParsedBytes: number;
    readonly integrityParsedBytes: number;
    readonly sourceReadAmplification: number;
    readonly unreachableSourceBytes: number;
    readonly manifestReadAmplification: number;
    readonly directoryReadAmplification: number;
    readonly inventoryPayloadBytes: number;
    readonly repeatedResolutionFraction: number;
    readonly repeatedEliminationFraction: number;
    readonly repeatedIntegrityFraction: number;
};

export type PerformanceMeasurement = TinybenchMeasurement & {
    readonly name: string;
    readonly kind: 'analysis' | 'packing' | 'publishing' | 'vendoring';
    readonly metrics: WorkMetrics;
};
