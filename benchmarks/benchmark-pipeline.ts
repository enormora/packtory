import { RealFileSystemHost } from '@ts-morph/common';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import { buildPackageProcessorComposition } from '../source/packages/package-processor.composition.ts';
import { createPacktory, type Packtory } from '../source/packtory/packtory.ts';
import { createScheduler } from '../source/packtory/scheduler.ts';
import { createVendorMaterializer } from '../source/vendor-materializer/vendor-materializer.ts';
import { createBenchmarkIntegrityChecks } from './benchmark-integrity-checks.ts';
import { observeBenchmarkFiles } from './benchmark-file-observation.ts';
import { createBenchmarkAnalysis } from './benchmark-analysis.ts';
import type { WorkMetrics } from './performance-benchmark-types.ts';

type PipelineInputs = {
    readonly repositoryFolder: string;
    readonly sourceFiles: ReadonlyMap<string, string>;
    readonly reachableFiles: ReadonlySet<string>;
    readonly inventoryFiles: ReadonlyMap<string, Buffer>;
};
export type BenchmarkPipeline = {
    readonly packtory: Packtory;
    readonly reset: () => void;
    readonly metrics: () => WorkMetrics;
};

export function createBenchmarkPipeline(fileManager: FileManager, inputs: PipelineInputs): BenchmarkPipeline {
    const parts = buildPackageProcessorComposition({
        continuousIntegrationEnvironment: {
            githubServerAddress: undefined,
            githubRepository: undefined,
            gitlabProjectAddress: undefined
        },
        repositoryFolder: inputs.repositoryFolder
    });
    const files = observeBenchmarkFiles({ ...inputs, fileManager, fileSystemHost: new RealFileSystemHost() });
    let eliminationParsedBytes = 0;
    let integrityParsedBytes = 0;
    const analysis = createBenchmarkAnalysis(parts, files, function (bytes) {
        eliminationParsedBytes += bytes;
    });
    return {
        packtory: createPacktory({
            ...parts,
            withAnalysisInputs: analysis.inputValidator.run,
            fileManager: files.fileManager,
            packageProcessor: { ...parts.packageProcessor, ...analysis.operations },
            deadCodeEliminator: analysis.deadCodeEliminator,
            inspectSymbols: analysis.deadCodeEliminator.inspectSymbols,
            scheduler: createScheduler({ progressBroadcastProvider: parts.progressBroadcaster.provider }),
            vendorMaterializer: createVendorMaterializer({ fileManager: files.fileManager }),
            runChecks: createBenchmarkIntegrityChecks(inputs.repositoryFolder, files.fileManager, function (bytes) {
                integrityParsedBytes += bytes;
            }, analysis.inputValidator)
        }),
        reset() {
            files.reset();
            eliminationParsedBytes = 0;
            integrityParsedBytes = 0;
        },
        metrics() {
            return { ...files.metrics(), eliminationParsedBytes, integrityParsedBytes };
        }
    };
}
