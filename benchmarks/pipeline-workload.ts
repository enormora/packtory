import assert from 'node:assert/strict';
import path from 'node:path';
import { match } from 'ts-pattern';
import type { PacktoryConfiguration, PackageConfiguration } from '../source/configuration/configuration.ts';
import type { RegistrySettings } from '../source/configuration/registry-settings.ts';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import { createAnalysisWorkload, type AnalysisWorkload } from './analysis-workload.ts';
import { createVendoringWorkload, type VendoringWorkload } from './vendoring-workload.ts';
import type { PerformanceWorkload } from './performance-benchmark-types.ts';

const baseCase = {
    commandLine: false,
    mode: 'analysis',
    packages: 'single',
    multipleRoots: false,
    declarations: true,
    graph: 'independent',
    deadExports: false,
    crossPackage: false,
    integrity: false,
    vendor: false
} as const;
export const pipelineCases = [
    { ...baseCase, name: 'command-line-startup', commandLine: true, minimal: true },
    { ...baseCase, name: 'single-package-control', minimal: true },
    { ...baseCase, name: 'shared-folder-single-package', minimal: false },
    { ...baseCase, name: 'shared-source-packages', packages: 'shared', minimal: false },
    { ...baseCase, name: 'multi-root-package', multipleRoots: true, minimal: false },
    { ...baseCase, name: 'dead-export-pruning', deadExports: true, declarations: false, graph: 'wide', minimal: false },
    { ...baseCase, name: 'cross-package-dead-code', packages: 'shared', crossPackage: true, minimal: false },
    { ...baseCase, name: 'integrity-checks', packages: 'integrity', integrity: true, minimal: false },
    { ...baseCase, name: 'pack-folder', mode: 'folder', vendor: true, minimal: false },
    { ...baseCase, name: 'pack-tar', mode: 'tar', vendor: true, minimal: false },
    { ...baseCase, name: 'pack-zip', mode: 'zip', vendor: true, minimal: false },
    { ...baseCase, name: 'pack-all-vendor', mode: 'batch', packages: 'shared', vendor: true, minimal: false },
    {
        ...baseCase,
        name: 'pack-all-vendor-integrity',
        mode: 'batch',
        packages: 'integrity',
        integrity: true,
        vendor: true,
        minimal: false
    },
    { ...baseCase, name: 'dry-run-publish', mode: 'publish', packages: 'shared', minimal: false },
    { ...baseCase, name: 'dry-run-integrity', mode: 'publish', packages: 'integrity', integrity: true, minimal: false },
    {
        ...baseCase,
        name: 'pack-then-dry-run',
        mode: 'pack-then-publish',
        packages: 'integrity',
        integrity: true,
        vendor: true,
        minimal: false
    },
    {
        ...baseCase,
        name: 'repeated-dry-run',
        mode: 'repeat-publish',
        packages: 'integrity',
        integrity: true,
        minimal: false
    },
    {
        ...baseCase,
        name: 'command-line-pack',
        mode: 'batch',
        packages: 'integrity',
        integrity: true,
        vendor: true,
        commandLine: true,
        minimal: false
    },
    {
        ...baseCase,
        name: 'command-line-publish',
        mode: 'publish',
        packages: 'integrity',
        integrity: true,
        vendor: true,
        commandLine: true,
        minimal: false
    },
    {
        ...baseCase,
        name: 'command-line-sequence',
        mode: 'pack-then-publish',
        packages: 'integrity',
        integrity: true,
        vendor: true,
        commandLine: true,
        minimal: false
    }
] as const;
export type PipelineCase = (typeof pipelineCases)[number];
export type PipelineWorkload = AnalysisWorkload & {
    readonly configuration: PacktoryConfiguration;
    readonly vendorFiles: ReadonlyMap<string, Buffer>;
};
export type PipelineWorkloadRequest = {
    readonly rootDirectory: string;
    readonly scenario: PipelineCase;
    readonly definition: PerformanceWorkload;
    readonly registrySettings: RegistrySettings;
};

function packageCountFor(scenario: PipelineCase, definition: PerformanceWorkload): number {
    return match(scenario.packages)
        .with('integrity', function () {
            return definition.integrityPackageCount;
        })
        .with('shared', function () {
            return definition.entryPointCount;
        })
        .with('single', function () {
            return 1;
        })
        .exhaustive();
}

function previousEntryExport(index: number): string {
    return index === 0 ? '' : `export { value0 as previous } from './entry-${index - 1}.js';`;
}

async function addEntryImports(
    fileManager: FileManager,
    workload: AnalysisWorkload,
    vendor: VendoringWorkload,
    crossPackage: boolean
): Promise<AnalysisWorkload> {
    const rewrites = await Promise.all(workload.runtimeEntries.map(async function (entry, index) {
        const externalImports = vendor.initialDependencyNames.map(function (name, dependencyIndex) {
            return `export { value as external${dependencyIndex} } from '${name}';`;
        });
        const siblingImport = crossPackage ? previousEntryExport(index) : '';
        const declarationEntry = workload.declarationEntries[index];
        const declarations = vendor.initialDependencyNames.map(function (_name, dependencyIndex) {
            return `export declare const external${dependencyIndex}: number;`;
        });
        const files = [
            [ entry, [ workload.sourceFiles.get(entry) ?? '', ...externalImports, siblingImport ].join('\n') ] as const,
            ...declarationEntry === undefined
                ? []
                : [
                    [
                        declarationEntry,
                        [
                            workload
                                .sourceFiles
                                .get(declarationEntry) ?? '',
                            ...declarations,
                            siblingImport
                        ]
                            .join('\n')
                    ] as const
                ]
        ];
        for (const [ filePath, content ] of files) {
            await fileManager.writeFile(filePath, content);
        }
        return files;
    }));
    return { ...workload, sourceFiles: new Map([ ...workload.sourceFiles, ...rewrites.flat() ]) };
}

function packageConfigurations(
    request: PipelineWorkloadRequest,
    workload: AnalysisWorkload
): readonly PackageConfiguration[] {
    return Array.from({ length: packageCountFor(request.scenario, request.definition) }, function (_value, index) {
        const main = workload.roots[`entry${index}`];
        assert.ok(main !== undefined);
        return {
            name: `performance-package-${index}`,
            sourcesFolder: path.join(request.rootDirectory, 'source'),
            roots: request.scenario.multipleRoots
                ? Object.fromEntries(
                    Object.entries(workload.roots).map(function ([ key, root ], rootIndex) {
                        return [ rootIndex === 0 ? 'main' : key, root ];
                    })
                )
                : { main },
            defaultModuleRoot: 'main',
            bundleDependencies: request.scenario.crossPackage && index > 0 ? [ `performance-package-${index - 1}` ] : []
        };
    });
}

export async function createPipelineWorkload(
    fileManager: FileManager,
    request: PipelineWorkloadRequest
): Promise<PipelineWorkload> {
    const { scenario, definition, rootDirectory } = request;
    const baseWorkload = await createAnalysisWorkload(fileManager, path.join(rootDirectory, 'source'), {
        sourceFileCount: scenario.minimal ? 1 : definition.sourceFileCount,
        exportsPerFile: scenario.deadExports ? definition.deadExportsPerFile : definition.exportsPerFile,
        entryPointCount: scenario.multipleRoots ? definition.entryPointCount : packageCountFor(scenario, definition),
        declarations: scenario.declarations,
        graph: scenario.graph
    });
    const vendor = scenario.vendor
        ? await createVendoringWorkload(fileManager, rootDirectory, 'diamond', definition)
        : { initialDependencyNames: [], manifestPaths: new Set<string>(), files: new Map<string, Buffer>() };
    const workload = await addEntryImports(fileManager, baseWorkload, vendor, scenario.crossPackage);
    return {
        ...workload,
        vendorFiles: vendor.files,
        configuration: {
            registrySettings: request.registrySettings,
            checks: { typeScriptIntegrity: { enabled: scenario.integrity, declarations: 'all' } },
            commonPackageSettings: {
                mainPackageManifest: {
                    type: 'module',
                    dependencies: Object.fromEntries(vendor.initialDependencyNames.map(function (dependency) {
                        return [ dependency, '1.0.0' ];
                    }))
                },
                includeSourceMapFiles: false,
                publishSettings: { access: 'public' }
            },
            packages: packageConfigurations(request, workload)
        }
    };
}
