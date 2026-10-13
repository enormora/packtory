export const workloadSizes = [ 'small', 'medium', 'large' ] as const;
export const commandLineInterfaceWorkloadSizes = [ 'medium', 'large' ] as const;

export type WorkloadSize = (typeof workloadSizes)[number];
export type CommandLineInterfaceWorkloadSize = (typeof commandLineInterfaceWorkloadSizes)[number];

export type WorkloadDefinition = {
    readonly clusterCount: number;
    readonly packageCount: number;
    readonly javaScriptFileCount: number;
    readonly declarationFileCount: number;
    readonly sourceMapFileCount: number;
    readonly maximumImportFanOut: number;
};

export type CommandLineInterfaceWorkloadDefinition = {
    readonly packageCount: number;
    readonly javaScriptFileCount: number;
    readonly declarationFileCount: number;
    readonly sourceMapFileCount: number;
    readonly maximumImportFanOut: number;
};

export type WorkloadsFile = {
    readonly seedFixture: string;
    readonly workloads: Readonly<Record<WorkloadSize, WorkloadDefinition>>;
    readonly commandLineInterfaceWorkloads: Readonly<
        Record<CommandLineInterfaceWorkloadSize, CommandLineInterfaceWorkloadDefinition>
    >;
};

export type ThroughputThreshold = {
    readonly medianMilliseconds: number;
};

export type ResponsivenessThreshold = {
    readonly p99Milliseconds: number;
    readonly maximumMilliseconds: number;
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
        readonly 'publish-command-line-interface': {
            readonly intervalMilliseconds: number;
            readonly medium: ResponsivenessThreshold;
            readonly large: ResponsivenessThreshold;
        };
    };
};

export type TinybenchMeasurement = {
    readonly medianMilliseconds: number;
    readonly sampleCount: number;
};

export type ThroughputBenchmarkMeasurement = TinybenchMeasurement & {
    readonly benchmarkName: 'build-artifacts' | 'resolve-and-link';
    readonly size: WorkloadSize;
};

export type CommandLineInterfaceResponsivenessMeasurement = TinybenchMeasurement & {
    readonly benchmarkName: 'publish-command-line-interface';
    readonly size: CommandLineInterfaceWorkloadSize;
    readonly frameCount: number;
    readonly p99FrameGapMilliseconds: number;
    readonly maximumFrameGapMilliseconds: number;
    readonly eventLoopHistogramP99Milliseconds: number;
    readonly eventLoopHistogramMaximumMilliseconds: number;
    readonly eventLoopSampledMaximumBlockMilliseconds: number;
};
