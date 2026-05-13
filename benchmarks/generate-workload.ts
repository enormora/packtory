import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PacktoryConfig, PacktoryConfigWithoutRegistry } from '../source/config/config.ts';
import type { RegistrySettings } from '../source/config/registry-settings.ts';
import type {
    CliWorkloadDefinition,
    CliWorkloadSize,
    WorkloadDefinition,
    WorkloadsFile,
    WorkloadSize
} from './benchmark-types.ts';

type BenchmarkPackage = NonNullable<PacktoryConfigWithoutRegistry['packages']>[number];

const jsonIndentationSpaces = 4;
const packagesPerCluster = 3;
const clusterJavaScriptFileCount = 6;
const clusterDeclarationFileCount = 5;
const clusterSourceMapFileCount = 6;
const clusterSourceMapVersion = 3;

const sharedMainPackageJson = {
    name: 'test-fixture',
    version: '0.0.0-dev',
    dependencies: {
        'dep-a': '42.0.0',
        'dep-b': '21.0.0'
    },
    type: 'module'
} as const;

type GeneratedCounts = {
    packageCount: number;
    jsFileCount: number;
    declarationFileCount: number;
    sourceMapFileCount: number;
    maxImportFanOut: number;
};

export type GeneratedWorkload = {
    readonly rootDirectory: string;
    readonly size: WorkloadSize;
    readonly definition: WorkloadDefinition;
    createConfigWithoutRegistry: () => PacktoryConfigWithoutRegistry;
    createConfig: (registrySettings: RegistrySettings) => PacktoryConfig;
    createConfigModuleText: (registrySettings: RegistrySettings) => string;
};

type GenerateWorkloadParams = {
    readonly rootDirectory: string;
    readonly size: WorkloadSize;
    readonly workloads: WorkloadsFile;
};

type GenerateCliWorkloadParams = {
    readonly rootDirectory: string;
    readonly size: CliWorkloadSize;
    readonly workloads: WorkloadsFile;
};

function createSourceMap(fileName: string, sourceName: string): string {
    const sourceMap = {
        version: clusterSourceMapVersion,
        file: fileName,
        sourceRoot: '',
        sources: [`./src/${sourceName}`],
        names: [],
        mappings: ''
    };

    return `${JSON.stringify(sourceMap)}\n`;
}

function createClusterSourceFiles(): Record<string, string> {
    return {
        'entry1.js': "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
        'entry1.js.map': createSourceMap('entry1.js', 'entry1.ts'),
        'entry1.d.ts': "export declare const foo: import('./foo.js').Foo;\n",
        'entry2.js': "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
        'entry2.js.map': createSourceMap('entry2.js', 'entry2.ts'),
        'entry2.d.ts': "export declare const foo: import('./foo.js').Foo;\n",
        'entry3.js': "import { foo } from './foo.js';\n//# sourceMappingURL=entry3.js.map\n",
        'entry3.js.map': createSourceMap('entry3.js', 'entry3.ts'),
        'entry3.d.ts': "export declare const foo: import('./foo.js').Foo;\n",
        'foo.js': "import { bar } from './bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n",
        'foo.js.map': createSourceMap('foo.js', 'foo.ts'),
        'foo.d.ts': "import { Baz } from './baz.js';\nexport type Foo = string;\n",
        'bar.js': "import { qux } from './qux.js';\nexport const bar = 'bar';\n//# sourceMappingURL=bar.js.map\n",
        'bar.js.map': createSourceMap('bar.js', 'bar.ts'),
        'baz.d.ts': 'export type Baz = number;\n',
        'qux.js': "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
        'qux.js.map': createSourceMap('qux.js', 'qux.ts')
    };
}

function createCliPackageSourceFiles(): Record<string, string> {
    const sourceFiles: Record<string, string> = {};
    const featureNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const sharedNames = ['a', 'b', 'c', 'd', 'e', 'f'];

    sourceFiles['index.js'] = `${featureNames
        .map((featureName) => {
            return `import { feature${featureName.toUpperCase()} } from './feature-${featureName}.js';`;
        })
        .join('\n')}\n//# sourceMappingURL=index.js.map\n`;
    sourceFiles['index.js.map'] = createSourceMap('index.js', 'index.ts');
    sourceFiles['index.d.ts'] = featureNames
        .map((featureName) => {
            const upperCaseFeatureName = featureName.toUpperCase();
            return (
                `export declare const feature${upperCaseFeatureName}: ` +
                `import('./feature-${featureName}.js').Feature${upperCaseFeatureName};`
            );
        })
        .join('\n')
        .concat('\n');

    sharedNames.forEach((sharedName) => {
        sourceFiles[`shared-${sharedName}.js`] =
            `export const shared${sharedName.toUpperCase()} = ` +
            `'shared-${sharedName}';\n` +
            `//# sourceMappingURL=shared-${sharedName}.js.map\n`;
        sourceFiles[`shared-${sharedName}.js.map`] = createSourceMap(
            `shared-${sharedName}.js`,
            `shared-${sharedName}.ts`
        );
        sourceFiles[`shared-${sharedName}.d.ts`] = `export type Shared${sharedName.toUpperCase()} = string;\n`;
    });

    featureNames.forEach((featureName, index) => {
        const sharedName = sharedNames[index % sharedNames.length];
        if (sharedName === undefined) {
            throw new Error(`Missing shared CLI benchmark module for feature "${featureName}"`);
        }

        sourceFiles[`feature-${featureName}.js`] =
            `import { internal${featureName.toUpperCase()} } from './internal-${featureName}.js';\n` +
            `import { shared${sharedName.toUpperCase()} } from './shared-${sharedName}.js';\n` +
            `export const feature${featureName.toUpperCase()} = ` +
            `internal${featureName.toUpperCase()} + ':' + ` +
            `shared${sharedName.toUpperCase()};\n` +
            `//# sourceMappingURL=feature-${featureName}.js.map\n`;
        sourceFiles[`feature-${featureName}.js.map`] = createSourceMap(
            `feature-${featureName}.js`,
            `feature-${featureName}.ts`
        );
        sourceFiles[`feature-${featureName}.d.ts`] =
            `export type Feature${featureName.toUpperCase()} = ` +
            `import('./shared-${sharedName}.js').Shared${sharedName.toUpperCase()};\n`;
        sourceFiles[`internal-${featureName}.js`] =
            `export const internal${featureName.toUpperCase()} = 'benchmark-${featureName}';\n` +
            `//# sourceMappingURL=internal-${featureName}.js.map\n`;
        sourceFiles[`internal-${featureName}.js.map`] = createSourceMap(
            `internal-${featureName}.js`,
            `internal-${featureName}.ts`
        );
    });

    return sourceFiles;
}

async function writeClusterFiles(clusterRootDirectory: string): Promise<void> {
    const sourceDirectory = path.join(clusterRootDirectory, 'src');
    const docsDirectory = path.join(clusterRootDirectory, 'docs');

    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.mkdir(docsDirectory, { recursive: true });

    const clusterSourceFiles = createClusterSourceFiles();
    for (const [fileName, contents] of Object.entries(clusterSourceFiles)) {
        await fs.writeFile(path.join(sourceDirectory, fileName), contents);
    }

    await fs.writeFile(path.join(docsDirectory, 'common.txt'), 'Common benchmark documentation\n');
    await fs.writeFile(path.join(docsDirectory, 'first.txt'), 'First package benchmark documentation\n');
}

async function writeCliPackageFiles(packageRootDirectory: string): Promise<void> {
    const sourceDirectory = path.join(packageRootDirectory, 'src');
    const docsDirectory = path.join(packageRootDirectory, 'docs');

    await fs.mkdir(sourceDirectory, { recursive: true });
    await fs.mkdir(docsDirectory, { recursive: true });

    for (const [fileName, contents] of Object.entries(createCliPackageSourceFiles())) {
        await fs.writeFile(path.join(sourceDirectory, fileName), contents);
    }

    await fs.writeFile(path.join(docsDirectory, 'readme.txt'), 'CLI benchmark package documentation\n');
}

function countFanOut(sourceFileContents: string): number {
    const importCount = sourceFileContents.split('\n').filter((line) => {
        return line.startsWith('import ');
    }).length;
    const sourceMapCount = sourceFileContents.includes('//# sourceMappingURL=') ? 1 : 0;
    return importCount + sourceMapCount;
}

function createPackageConfigs(rootDirectory: string, clusterCount: number): readonly BenchmarkPackage[] {
    const packages: BenchmarkPackage[] = [];

    for (let clusterIndex = 1; clusterIndex <= clusterCount; clusterIndex += 1) {
        const packageDirectory = path.join(rootDirectory, `cluster-${clusterIndex}`);
        const sourcesFolder = path.join(packageDirectory, 'src');

        packages.push(
            {
                name: `first-${clusterIndex}`,
                sourcesFolder,
                roots: { main: { js: 'entry1.js', declarationFile: 'entry1.d.ts' } },
                additionalFiles: [{ sourceFilePath: '../docs/first.txt', targetFilePath: 'docs/first.txt' }]
            },
            {
                name: `second-${clusterIndex}`,
                sourcesFolder,
                roots: { main: { js: 'entry2.js', declarationFile: 'entry2.d.ts' } },
                bundleDependencies: [`first-${clusterIndex}`]
            },
            {
                name: `third-${clusterIndex}`,
                sourcesFolder,
                roots: { main: { js: 'entry3.js', declarationFile: 'entry3.d.ts' } },
                bundleDependencies: [`first-${clusterIndex}`],
                bundlePeerDependencies: [`second-${clusterIndex}`]
            }
        );
    }

    return packages;
}

function createConfigWithoutRegistry(rootDirectory: string, clusterCount: number): PacktoryConfigWithoutRegistry {
    return {
        commonPackageSettings: {
            mainPackageJson: sharedMainPackageJson,
            includeSourceMapFiles: true,
            additionalFiles: [{ sourceFilePath: '../docs/common.txt', targetFilePath: 'docs/common.txt' }],
            publishSettings: { access: 'public' }
        },
        packages: createPackageConfigs(rootDirectory, clusterCount)
    };
}

function createConfig(rootDirectory: string, clusterCount: number, registrySettings: RegistrySettings): PacktoryConfig {
    return {
        registrySettings,
        ...createConfigWithoutRegistry(rootDirectory, clusterCount)
    };
}

function createCliPackageConfigs(rootDirectory: string, packageCount: number): readonly BenchmarkPackage[] {
    const packages: BenchmarkPackage[] = [];

    for (let packageIndex = 1; packageIndex <= packageCount; packageIndex += 1) {
        const packageDirectory = path.join(rootDirectory, `package-${packageIndex}`);

        packages.push({
            name: `parallel-package-${packageIndex}`,
            sourcesFolder: path.join(packageDirectory, 'src'),
            roots: { main: { js: 'index.js', declarationFile: 'index.d.ts' } },
            additionalFiles: [{ sourceFilePath: '../docs/readme.txt', targetFilePath: 'docs/readme.txt' }]
        });
    }

    return packages;
}

function createCliConfigWithoutRegistry(rootDirectory: string, packageCount: number): PacktoryConfigWithoutRegistry {
    return {
        commonPackageSettings: {
            mainPackageJson: sharedMainPackageJson,
            includeSourceMapFiles: true,
            publishSettings: { access: 'public' }
        },
        packages: createCliPackageConfigs(rootDirectory, packageCount)
    };
}

function createCliConfig(
    rootDirectory: string,
    packageCount: number,
    registrySettings: RegistrySettings
): PacktoryConfig {
    return {
        registrySettings,
        ...createCliConfigWithoutRegistry(rootDirectory, packageCount)
    };
}

function gatherCounts(clusterCount: number): GeneratedCounts {
    const clusterSources = Object.values(createClusterSourceFiles());

    return {
        packageCount: clusterCount * packagesPerCluster,
        jsFileCount: clusterCount * clusterJavaScriptFileCount,
        declarationFileCount: clusterCount * clusterDeclarationFileCount,
        sourceMapFileCount: clusterCount * clusterSourceMapFileCount,
        maxImportFanOut: clusterSources.reduce((currentMaximum, sourceFileContents) => {
            return Math.max(currentMaximum, countFanOut(sourceFileContents));
        }, 0)
    };
}

function createGeneratedWorkloadCountMismatchMessage(
    size: WorkloadSize,
    actualCount: number,
    expectedCount: number,
    fileKind: string
): string {
    return [`Generated workload "${size}" produced ${actualCount} ${fileKind},`, `expected ${expectedCount}`].join(' ');
}

function createGeneratedWorkloadFanOutMismatchMessage(
    size: WorkloadSize,
    actualFanOut: number,
    expectedFanOut: number
): string {
    return [
        `Generated workload "${size}" produced max import fan-out ${actualFanOut},`,
        `expected at most ${expectedFanOut}`
    ].join(' ');
}

function validateGeneratedWorkload(definition: WorkloadDefinition, counts: GeneratedCounts, size: WorkloadSize): void {
    assert.ok(
        counts.packageCount === definition.packageCount,
        `Generated workload "${size}" produced ${counts.packageCount} packages, expected ${definition.packageCount}`
    );
    assert.ok(
        counts.jsFileCount === definition.jsFileCount,
        createGeneratedWorkloadCountMismatchMessage(
            size,
            counts.jsFileCount,
            definition.jsFileCount,
            'JavaScript files'
        )
    );
    assert.ok(
        counts.declarationFileCount === definition.declarationFileCount,
        createGeneratedWorkloadCountMismatchMessage(
            size,
            counts.declarationFileCount,
            definition.declarationFileCount,
            'declaration files'
        )
    );
    assert.ok(
        counts.sourceMapFileCount === definition.sourceMapFileCount,
        createGeneratedWorkloadCountMismatchMessage(
            size,
            counts.sourceMapFileCount,
            definition.sourceMapFileCount,
            'source maps'
        )
    );
    assert.ok(
        counts.maxImportFanOut <= definition.maxImportFanOut,
        createGeneratedWorkloadFanOutMismatchMessage(size, counts.maxImportFanOut, definition.maxImportFanOut)
    );
}

function gatherCliCounts(packageCount: number): GeneratedCounts {
    const packageSources = createCliPackageSourceFiles();
    const filePaths = Object.keys(packageSources);

    return {
        packageCount,
        jsFileCount:
            packageCount *
            filePaths.filter((filePath) => {
                return filePath.endsWith('.js');
            }).length,
        declarationFileCount:
            packageCount *
            filePaths.filter((filePath) => {
                return filePath.endsWith('.d.ts');
            }).length,
        sourceMapFileCount:
            packageCount *
            filePaths.filter((filePath) => {
                return filePath.endsWith('.js.map');
            }).length,
        maxImportFanOut: Object.values(packageSources).reduce((currentMaximum, sourceFileContents) => {
            return Math.max(currentMaximum, countFanOut(sourceFileContents));
        }, 0)
    };
}

function createGeneratedCliWorkloadCountMismatchMessage(
    size: CliWorkloadSize,
    actualCount: number,
    expectedCount: number,
    fileKind: string
): string {
    return [`Generated CLI workload "${size}" produced ${actualCount} ${fileKind},`, `expected ${expectedCount}`].join(
        ' '
    );
}

function createGeneratedCliWorkloadFanOutMismatchMessage(
    size: CliWorkloadSize,
    actualFanOut: number,
    expectedFanOut: number
): string {
    return [
        `Generated CLI workload "${size}" produced max import fan-out ${actualFanOut},`,
        `expected at most ${expectedFanOut}`
    ].join(' ');
}

function validateGeneratedCliWorkload(
    definition: CliWorkloadDefinition,
    counts: GeneratedCounts,
    size: CliWorkloadSize
): void {
    assert.ok(
        counts.packageCount === definition.packageCount,
        `Generated CLI workload "${size}" produced ${counts.packageCount} packages, expected ${definition.packageCount}`
    );
    assert.ok(
        counts.jsFileCount === definition.jsFileCount,
        createGeneratedCliWorkloadCountMismatchMessage(
            size,
            counts.jsFileCount,
            definition.jsFileCount,
            'JavaScript files'
        )
    );
    assert.ok(
        counts.declarationFileCount === definition.declarationFileCount,
        createGeneratedCliWorkloadCountMismatchMessage(
            size,
            counts.declarationFileCount,
            definition.declarationFileCount,
            'declaration files'
        )
    );
    assert.ok(
        counts.sourceMapFileCount === definition.sourceMapFileCount,
        createGeneratedCliWorkloadCountMismatchMessage(
            size,
            counts.sourceMapFileCount,
            definition.sourceMapFileCount,
            'source maps'
        )
    );
    assert.ok(
        counts.maxImportFanOut <= definition.maxImportFanOut,
        createGeneratedCliWorkloadFanOutMismatchMessage(size, counts.maxImportFanOut, definition.maxImportFanOut)
    );
}

export async function generateWorkload(params: GenerateWorkloadParams): Promise<GeneratedWorkload> {
    const definition = params.workloads.workloads[params.size];

    for (let clusterIndex = 1; clusterIndex <= definition.clusterCount; clusterIndex += 1) {
        await writeClusterFiles(path.join(params.rootDirectory, `cluster-${clusterIndex}`));
    }

    const counts = gatherCounts(definition.clusterCount);
    validateGeneratedWorkload(definition, counts, params.size);

    return {
        rootDirectory: params.rootDirectory,
        size: params.size,
        definition,
        createConfigWithoutRegistry() {
            return createConfigWithoutRegistry(params.rootDirectory, definition.clusterCount);
        },
        createConfig(registrySettings) {
            return createConfig(params.rootDirectory, definition.clusterCount, registrySettings);
        },
        createConfigModuleText(registrySettings) {
            const config = createConfig(params.rootDirectory, definition.clusterCount, registrySettings);
            return `export const config = ${JSON.stringify(config, null, jsonIndentationSpaces)};\n`;
        }
    };
}

export async function generateCliWorkload(params: GenerateCliWorkloadParams): Promise<{
    readonly rootDirectory: string;
    readonly size: CliWorkloadSize;
    readonly definition: CliWorkloadDefinition;
    readonly packageNames: readonly string[];
    createConfig: (registrySettings: RegistrySettings) => PacktoryConfig;
    createConfigModuleText: (registrySettings: RegistrySettings) => string;
}> {
    const definition = params.workloads.cliWorkloads[params.size];

    for (let packageIndex = 1; packageIndex <= definition.packageCount; packageIndex += 1) {
        await writeCliPackageFiles(path.join(params.rootDirectory, `package-${packageIndex}`));
    }

    const counts = gatherCliCounts(definition.packageCount);
    validateGeneratedCliWorkload(definition, counts, params.size);

    return {
        rootDirectory: params.rootDirectory,
        size: params.size,
        definition,
        packageNames: createCliPackageConfigs(params.rootDirectory, definition.packageCount).map((entry) => {
            return entry.name;
        }),
        createConfig(registrySettings) {
            return createCliConfig(params.rootDirectory, definition.packageCount, registrySettings);
        },
        createConfigModuleText(registrySettings) {
            const config = createCliConfig(params.rootDirectory, definition.packageCount, registrySettings);
            return `export const config = ${JSON.stringify(config, null, jsonIndentationSpaces)};\n`;
        }
    };
}
