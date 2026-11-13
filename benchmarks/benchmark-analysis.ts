import { Project } from 'ts-morph';
import {
    createResolveAndBuildOperations,
    type ResolveAndBuildOperations
} from '../source/packtory/package-processor-build.ts';
import type { InspectableDeadCodeEliminator } from '../source/dead-code-eliminator/eliminator.ts';
import { createResourceResolver } from '../source/resource-resolver/resource-resolver.ts';
import { createBundleLinker } from '../source/linker/linker.ts';
import { createWorkspaceInspector } from '../source/report/inspectors/inspect-workspace.ts';
import type { PackageProcessorComposition } from '../source/packages/package-processor.composition.ts';
import type { BenchmarkFileObservation } from './benchmark-file-observation.ts';
import { createBenchmarkScanner, type BenchmarkScanner } from './benchmark-scanner.ts';
import { createBenchmarkDeadCodeEliminator } from './benchmark-typescript-observation.ts';

type BenchmarkAnalysis = Pick<BenchmarkScanner, 'inputValidator'> & {
    readonly operations: ResolveAndBuildOperations;
    readonly deadCodeEliminator: InspectableDeadCodeEliminator;
};

export function createBenchmarkAnalysis(
    parts: PackageProcessorComposition,
    files: BenchmarkFileObservation,
    recordBytes: (bytes: number) => void
): BenchmarkAnalysis {
    const deadCodeEliminator = createBenchmarkDeadCodeEliminator(parts.progressBroadcaster.provider, recordBytes);
    const { scanner, inputValidator } = createBenchmarkScanner(files.fileManager, files.fileSystemHost);
    return {
        inputValidator,
        deadCodeEliminator,
        operations: createResolveAndBuildOperations({
            inspectWorkspace: createWorkspaceInspector(function () {
                return new Project({
                    useInMemoryFileSystem: true,
                    skipLoadingLibFiles: true,
                    compilerOptions: { allowJs: true, checkJs: true, noEmit: true, noLib: true }
                });
            }),
            deadCodeEliminator,
            linker: createBundleLinker(),
            progressBroadcaster: parts.progressBroadcaster.provider,
            resourceResolver: createResourceResolver({
                fileManager: files.fileManager,
                dependencyScanner: scanner
            }),
            versionManager: parts.versionManager
        })
    };
}
