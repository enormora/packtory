import assert from 'node:assert/strict';
import path from 'node:path';
import { RealFileSystemHost } from '@ts-morph/common';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { DependencyScanner } from '../source/dependency-scanner/scanner.ts';
import { createAnalysisWorkload, type AnalysisWorkload, type AnalysisWorkloadDefinition } from './analysis-workload.ts';
import { observeBenchmarkFiles } from './benchmark-file-observation.ts';
import { createBenchmarkScanner } from './benchmark-scanner.ts';
import { measurePreparedAsynchronousTask } from './tinybench-measurement.ts';
import type { PerformanceMeasurement, PerformanceWorkload, WorkMetrics } from './performance-benchmark-types.ts';

const baseCase = { sourceFileCount: 'all', entryPointCount: 1, declarations: false, graph: 'independent' } as const;
const diamondModuleCount = 4;
export const compilerAnalysisCases = [
    { ...baseCase, name: 'single-root-control', sourceFileCount: 1 },
    { ...baseCase, name: 'unreachable-sources' },
    { ...baseCase, name: 'single-declaration-root', declarations: true },
    { ...baseCase, name: 'single-shared-runtime-root', graph: 'chain' },
    { ...baseCase, name: 'single-shared-declaration-root', graph: 'chain', declarations: true },
    { ...baseCase, name: 'shared-runtime-roots', graph: 'chain', entryPointCount: 'multiple' },
    { ...baseCase, name: 'shared-declaration-roots', graph: 'chain', entryPointCount: 'multiple', declarations: true },
    { ...baseCase, name: 'multiple-runtime-roots', entryPointCount: 'multiple' },
    { ...baseCase, name: 'multiple-declaration-roots', entryPointCount: 'multiple', declarations: true },
    { ...baseCase, name: 'wide-imports', graph: 'wide' },
    { ...baseCase, name: 'deep-imports', graph: 'chain' },
    { ...baseCase, name: 'diamond-imports', graph: 'diamond', sourceFileCount: diamondModuleCount },
    { ...baseCase, name: 'cyclic-imports', graph: 'cycle' }
] as const;
type CompilerAnalysisCase = (typeof compilerAnalysisCases)[number];

function workloadDefinition(scenario: CompilerAnalysisCase, workload: PerformanceWorkload): AnalysisWorkloadDefinition {
    return {
        sourceFileCount: scenario.sourceFileCount === 'all' ? workload.sourceFileCount : scenario.sourceFileCount,
        entryPointCount: scenario.entryPointCount === 'multiple' ? workload.entryPointCount : scenario.entryPointCount,
        exportsPerFile: workload.exportsPerFile,
        declarations: scenario.declarations,
        graph: scenario.graph
    };
}

async function scanWorkload(
    scanner: DependencyScanner,
    folder: string,
    workload: AnalysisWorkload
): Promise<void> {
    const found = new Set<string>();
    const entryGroups = [ [ workload.runtimeEntries, false ], [ workload.declarationEntries, true ] ] as const;
    const scanGroups = entryGroups.filter(function ([ entries ]) {
        return entries.length > 0;
    });
    for (const [ entries, resolveDeclarationFiles ] of scanGroups) {
        const graph = await scanner.scanEntries(entries, folder, {
            mainPackageManifest: { type: 'module' },
            resolveDeclarationFiles,
            includeSourceMapFiles: false
        });
        for (const entry of entries) {
            for (const file of graph.flatten(entry).localFiles) {
                found.add(file.filePath);
            }
        }
    }
    assert.deepEqual(found, workload.reachableFiles, 'Scanner must return the complete reachable graph');
}

export async function runCompilerAnalysisBenchmark(
    scenario: CompilerAnalysisCase,
    rootDirectory: string,
    fileManager: FileManager,
    definition: PerformanceWorkload
): Promise<PerformanceMeasurement> {
    const samples: WorkMetrics[] = [];
    let iteration = 0;
    const measurement = await measurePreparedAsynchronousTask(`compiler-analysis/${scenario.name}`, async function () {
        const sourcesFolder = path.join(rootDirectory, scenario.name, `sample-${iteration}`);
        iteration += 1;
        const workload = await createAnalysisWorkload(
            fileManager,
            sourcesFolder,
            workloadDefinition(scenario, definition)
        );
        const observation = observeBenchmarkFiles({
            fileManager,
            fileSystemHost: new RealFileSystemHost(),
            sourceFiles: workload.sourceFiles,
            reachableFiles: workload.reachableFiles,
            inventoryFiles: new Map()
        });
        const { scanner } = createBenchmarkScanner(fileManager, observation.fileSystemHost);
        return async function () {
            await scanWorkload(scanner, sourcesFolder, workload);
            samples.push(observation.metrics());
        };
    });
    const metrics = samples.at(-1);
    assert.ok(metrics !== undefined && metrics.sourceBytesRead > 0, 'Cold analysis must actually read compiler inputs');
    return { name: `compiler-analysis/${scenario.name}`, kind: 'analysis', ...measurement, metrics };
}
