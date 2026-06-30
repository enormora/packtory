export const workloadSizes = [ 'small', 'medium', 'large' ] as const;
export const cliWorkloadSizes = [ 'medium', 'large' ] as const;

export type WorkloadSize = (typeof workloadSizes)[number];
export type CliWorkloadSize = (typeof cliWorkloadSizes)[number];

export type WorkloadDefinition = {
    readonly clusterCount: number;
    readonly packageCount: number;
    readonly jsFileCount: number;
    readonly declarationFileCount: number;
    readonly sourceMapFileCount: number;
    readonly maxImportFanOut: number;
};

export type CliWorkloadDefinition = {
    readonly packageCount: number;
    readonly jsFileCount: number;
    readonly declarationFileCount: number;
    readonly sourceMapFileCount: number;
    readonly maxImportFanOut: number;
};

export type WorkloadsFile = {
    readonly seedFixture: string;
    readonly workloads: Readonly<Record<WorkloadSize, WorkloadDefinition>>;
    readonly cliWorkloads: Readonly<Record<CliWorkloadSize, CliWorkloadDefinition>>;
};

export type ThroughputThreshold = {
    readonly medianMs: number;
};

export type ResponsivenessThreshold = {
    readonly p99Ms: number;
    readonly maxMs: number;
};

export type ThresholdsFile = {
    readonly normalization: {
        readonly baselineMilliseconds: number;
    };
    readonly throughput: {
        readonly 'resolve-and-link': Readonly<Record<WorkloadSize, ThroughputThreshold>>;
        readonly 'build-artifacts': Readonly<Record<WorkloadSize, ThroughputThreshold>>;
    };
    readonly responsiveness: {
        readonly 'publish-cli': {
            readonly intervalMs: number;
            readonly medium: ResponsivenessThreshold;
            readonly large: ResponsivenessThreshold;
        };
    };
};

export type TinybenchMeasurement = {
    readonly medianMs: number;
    readonly sampleCount: number;
};

export type ThroughputBenchmarkMeasurement = TinybenchMeasurement & {
    readonly benchmarkName: 'build-artifacts' | 'resolve-and-link';
    readonly size: WorkloadSize;
};

export type CliResponsivenessMeasurement = TinybenchMeasurement & {
    readonly benchmarkName: 'publish-cli';
    readonly size: CliWorkloadSize;
    readonly frameCount: number;
    readonly p99FrameGapMs: number;
    readonly maxFrameGapMs: number;
    readonly eventLoopHistogramP99Ms: number;
    readonly eventLoopHistogramMaxMs: number;
    readonly eventLoopSampledMaxBlockMs: number;
};
