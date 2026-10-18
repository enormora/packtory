import fileSystem from 'node:fs/promises';
import path from 'node:path';
import type {
    PacktoryConfiguration,
    PacktoryConfigurationWithoutRegistry
} from '../source/configuration/configuration.ts';
import type { RegistrySettings } from '../source/configuration/registry-settings.ts';
import type {
    CommandLineInterfaceWorkloadDefinition,
    CommandLineInterfaceWorkloadSize,
    WorkloadDefinition,
    WorkloadsFile,
    WorkloadSize
} from './benchmark-types.ts';
import {
    validateGeneratedCommandLineInterfaceWorkload,
    validateGeneratedWorkload,
    type GeneratedCounts
} from './workload-validation.ts';

type BenchmarkPackage = NonNullable<PacktoryConfigurationWithoutRegistry['packages']>[number];

const javaScriptObjectNotationIndentationSpaces = 4;
const packagesPerCluster = 3;
const clusterJavaScriptFileCount = 6;
const clusterDeclarationFileCount = 7;
const clusterSourceMapFileCount = 6;
const clusterSourceMapVersion = 3;

const sharedMainPackageManifest = {
    name: 'test-fixture',
    version: '0.0.0-dev',
    dependencies: {
        'dependency-a': '42.0.0',
        'dependency-b': '21.0.0'
    },
    type: 'module'
} as const;

export type GeneratedWorkload = {
    readonly rootDirectory: string;
    readonly size: WorkloadSize;
    readonly definition: WorkloadDefinition;
    createConfigurationWithoutRegistry: () => PacktoryConfigurationWithoutRegistry;
    createConfiguration: (registrySettings: RegistrySettings) => PacktoryConfiguration;
    createConfigurationModuleText: (registrySettings: RegistrySettings) => string;
};

type GenerateWorkloadParameters = {
    readonly rootDirectory: string;
    readonly size: WorkloadSize;
    readonly workloads: WorkloadsFile;
};

type GenerateCommandLineInterfaceWorkloadParameters = {
    readonly rootDirectory: string;
    readonly size: CommandLineInterfaceWorkloadSize;
    readonly workloads: WorkloadsFile;
};

function createSourceMap(fileName: string, sourceName: string): string {
    const sourceMap = {
        version: clusterSourceMapVersion,
        file: fileName,
        sourceRoot: '',
        sources: [ `./source/${sourceName}` ],
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
        'entry2.js': "export { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
        'entry2.js.map': createSourceMap('entry2.js', 'entry2.ts'),
        'entry2.d.ts': "export { type Foo } from './foo.js';\nexport declare const foo: Foo;\n",
        'entry3.js': "import { foo } from './foo.js';\n//# sourceMappingURL=entry3.js.map\n",
        'entry3.js.map': createSourceMap('entry3.js', 'entry3.ts'),
        'entry3.d.ts': "export declare const foo: import('./foo.js').Foo;\n",
        'foo.js': "import { bar } from './bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n",
        'foo.js.map': createSourceMap('foo.js', 'foo.ts'),
        'foo.d.ts': "import { Baz } from './baz.js';\nexport type Foo = string;\n",
        'bar.js': "import { qux } from './qux.js';\nexport const bar = 'bar';\n//# sourceMappingURL=bar.js.map\n",
        'bar.js.map': createSourceMap('bar.js', 'bar.ts'),
        'bar.d.ts': 'export type Bar = string;\n',
        'baz.d.ts': 'export type Baz = number;\n',
        'qux.js': "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
        'qux.d.ts': 'export type Qux = string;\n',
        'qux.js.map': createSourceMap('qux.js', 'qux.ts')
    };
}

function createCommandLineInterfacePackageSourceFiles(): Record<string, string> {
    const sourceFiles: Record<string, string> = {};
    const featureNames = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l' ];
    const sharedNames = [ 'a', 'b', 'c', 'd', 'e', 'f' ];

    sourceFiles['index.js'] = `${
        featureNames
            .map(function (featureName) {
                return `import { feature${featureName.toUpperCase()} } from './feature-${featureName}.js';`;
            })
            .join('\n')
    }\n//# sourceMappingURL=index.js.map\n`;
    sourceFiles['index.js.map'] = createSourceMap('index.js', 'index.ts');
    sourceFiles['index.d.ts'] = featureNames
        .map(function (featureName) {
            const upperCaseFeatureName = featureName.toUpperCase();
            return (
                `export declare const feature${upperCaseFeatureName}: ` +
                `import('./feature-${featureName}.js').Feature${upperCaseFeatureName};`
            );
        })
        .join('\n')
        .concat('\n');

    sharedNames.forEach(function (sharedName) {
        sourceFiles[`shared-${sharedName}.js`] = `export const shared${sharedName.toUpperCase()} = ` +
            `'shared-${sharedName}';\n` +
            `//# sourceMappingURL=shared-${sharedName}.js.map\n`;
        sourceFiles[`shared-${sharedName}.js.map`] = createSourceMap(
            `shared-${sharedName}.js`,
            `shared-${sharedName}.ts`
        );
        sourceFiles[`shared-${sharedName}.d.ts`] = `export type Shared${sharedName.toUpperCase()} = string;\n`;
    });

    featureNames.forEach(function (featureName, index) {
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
        sourceFiles[`feature-${featureName}.d.ts`] = `export type Feature${featureName.toUpperCase()} = ` +
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
    const sourceDirectory = path.join(clusterRootDirectory, 'source');
    const documentationDirectory = path.join(clusterRootDirectory, 'documentation');

    await fileSystem.mkdir(sourceDirectory, { recursive: true });
    await fileSystem.mkdir(documentationDirectory, { recursive: true });

    const clusterSourceFiles = createClusterSourceFiles();
    for (const [ fileName, contents ] of Object.entries(clusterSourceFiles)) {
        await fileSystem.writeFile(path.join(sourceDirectory, fileName), contents);
    }

    await fileSystem.writeFile(path.join(documentationDirectory, 'common.txt'), 'Common benchmark documentation\n');
    await fileSystem.writeFile(
        path.join(documentationDirectory, 'first.txt'),
        'First package benchmark documentation\n'
    );
}

async function writeCommandLineInterfacePackageFiles(packageRootDirectory: string): Promise<void> {
    const sourceDirectory = path.join(packageRootDirectory, 'source');
    const documentationDirectory = path.join(packageRootDirectory, 'documentation');

    await fileSystem.mkdir(sourceDirectory, { recursive: true });
    await fileSystem.mkdir(documentationDirectory, { recursive: true });

    for (const [ fileName, contents ] of Object.entries(createCommandLineInterfacePackageSourceFiles())) {
        await fileSystem.writeFile(path.join(sourceDirectory, fileName), contents);
    }

    await fileSystem.writeFile(
        path.join(documentationDirectory, 'readme.txt'),
        'CLI benchmark package documentation\n'
    );
}

function countFanOut(sourceFileContents: string): number {
    const importCount = sourceFileContents
        .split('\n')
        .filter(function (line) {
            return line.startsWith('import ');
        })
        .length;
    const sourceMapCount = sourceFileContents.includes('//# sourceMappingURL=') ? 1 : 0;
    return importCount + sourceMapCount;
}

function createPackageConfigurations(rootDirectory: string, clusterCount: number): readonly BenchmarkPackage[] {
    const packages: BenchmarkPackage[] = [];

    for (let clusterIndex = 1; clusterIndex <= clusterCount; clusterIndex += 1) {
        const packageDirectory = path.join(rootDirectory, `cluster-${clusterIndex}`);
        const sourcesFolder = path.join(packageDirectory, 'source');

        packages.push(
            {
                name: `first-${clusterIndex}`,
                sourcesFolder,
                roots: { main: { javaScript: 'entry1.js', declarationFile: 'entry1.d.ts' } },
                additionalFiles: [ {
                    inputFilePath: '../documentation/first.txt',
                    targetFilePath: 'documentation/first.txt'
                } ]
            },
            {
                name: `second-${clusterIndex}`,
                sourcesFolder,
                roots: { main: { javaScript: 'entry2.js', declarationFile: 'entry2.d.ts' } },
                bundleDependencies: [ `first-${clusterIndex}` ]
            },
            {
                name: `third-${clusterIndex}`,
                sourcesFolder,
                roots: { main: { javaScript: 'entry3.js', declarationFile: 'entry3.d.ts' } },
                bundleDependencies: [ `first-${clusterIndex}` ],
                bundlePeerDependencies: [ `second-${clusterIndex}` ]
            }
        );
    }

    return packages;
}

function createConfigurationWithoutRegistry(
    rootDirectory: string,
    clusterCount: number
): PacktoryConfigurationWithoutRegistry {
    return {
        commonPackageSettings: {
            mainPackageManifest: sharedMainPackageManifest,
            includeSourceMapFiles: true,
            additionalFiles: [ {
                inputFilePath: '../documentation/common.txt',
                targetFilePath: 'documentation/common.txt'
            } ],
            publishSettings: { access: 'public' }
        },
        packages: createPackageConfigurations(rootDirectory, clusterCount)
    };
}

function createConfiguration(
    rootDirectory: string,
    clusterCount: number,
    registrySettings: RegistrySettings
): PacktoryConfiguration {
    return {
        registrySettings,
        ...createConfigurationWithoutRegistry(rootDirectory, clusterCount)
    };
}

function createCommandLineInterfacePackageConfigurations(
    rootDirectory: string,
    packageCount: number
): readonly BenchmarkPackage[] {
    const packages: BenchmarkPackage[] = [];

    for (let packageIndex = 1; packageIndex <= packageCount; packageIndex += 1) {
        const packageDirectory = path.join(rootDirectory, `package-${packageIndex}`);

        packages.push({
            name: `parallel-package-${packageIndex}`,
            sourcesFolder: path.join(packageDirectory, 'source'),
            roots: { main: { javaScript: 'index.js', declarationFile: 'index.d.ts' } },
            additionalFiles: [ {
                inputFilePath: '../documentation/readme.txt',
                targetFilePath: 'documentation/readme.txt'
            } ]
        });
    }

    return packages;
}

function createCommandLineInterfaceConfigurationWithoutRegistry(
    rootDirectory: string,
    packageCount: number
): PacktoryConfigurationWithoutRegistry {
    return {
        commonPackageSettings: {
            mainPackageManifest: sharedMainPackageManifest,
            includeSourceMapFiles: true,
            publishSettings: { access: 'public' }
        },
        packages: createCommandLineInterfacePackageConfigurations(rootDirectory, packageCount)
    };
}

function createCommandLineInterfaceConfiguration(
    rootDirectory: string,
    packageCount: number,
    registrySettings: RegistrySettings
): PacktoryConfiguration {
    return {
        registrySettings,
        ...createCommandLineInterfaceConfigurationWithoutRegistry(rootDirectory, packageCount)
    };
}

function gatherCounts(clusterCount: number): GeneratedCounts {
    const clusterSources = Object.values(createClusterSourceFiles());

    return {
        packageCount: clusterCount * packagesPerCluster,
        javaScriptFileCount: clusterCount * clusterJavaScriptFileCount,
        declarationFileCount: clusterCount * clusterDeclarationFileCount,
        sourceMapFileCount: clusterCount * clusterSourceMapFileCount,
        maximumImportFanOut: clusterSources.reduce(function (currentMaximum, sourceFileContents) {
            return Math.max(currentMaximum, countFanOut(sourceFileContents));
        }, 0)
    };
}

function gatherCommandLineInterfaceCounts(packageCount: number): GeneratedCounts {
    const packageSources = createCommandLineInterfacePackageSourceFiles();
    const filePaths = Object.keys(packageSources);

    return {
        packageCount,
        javaScriptFileCount: packageCount *
            filePaths
                .filter(function (filePath) {
                    return filePath.endsWith('.js');
                })
                .length,
        declarationFileCount: packageCount *
            filePaths
                .filter(function (filePath) {
                    return filePath.endsWith('.d.ts');
                })
                .length,
        sourceMapFileCount: packageCount *
            filePaths
                .filter(function (filePath) {
                    return filePath.endsWith('.js.map');
                })
                .length,
        maximumImportFanOut: Object.values(packageSources).reduce(function (currentMaximum, sourceFileContents) {
            return Math.max(currentMaximum, countFanOut(sourceFileContents));
        }, 0)
    };
}

export async function generateWorkload(parameters: GenerateWorkloadParameters): Promise<GeneratedWorkload> {
    const definition = parameters.workloads.workloads[parameters.size];

    for (let clusterIndex = 1; clusterIndex <= definition.clusterCount; clusterIndex += 1) {
        await writeClusterFiles(path.join(parameters.rootDirectory, `cluster-${clusterIndex}`));
    }

    const counts = gatherCounts(definition.clusterCount);
    validateGeneratedWorkload(definition, counts, parameters.size);

    return {
        rootDirectory: parameters.rootDirectory,
        size: parameters.size,
        definition,
        createConfigurationWithoutRegistry() {
            return createConfigurationWithoutRegistry(parameters.rootDirectory, definition.clusterCount);
        },
        createConfiguration(registrySettings) {
            return createConfiguration(parameters.rootDirectory, definition.clusterCount, registrySettings);
        },
        createConfigurationModuleText(registrySettings) {
            const configuration = createConfiguration(
                parameters.rootDirectory,
                definition.clusterCount,
                registrySettings
            );
            return `export const config = ${
                JSON.stringify(configuration, null, javaScriptObjectNotationIndentationSpaces)
            };\n`;
        }
    };
}

export async function generateCommandLineInterfaceWorkload(
    parameters: GenerateCommandLineInterfaceWorkloadParameters
): Promise<{
    readonly rootDirectory: string;
    readonly size: CommandLineInterfaceWorkloadSize;
    readonly definition: CommandLineInterfaceWorkloadDefinition;
    readonly packageNames: readonly string[];
    readonly createConfiguration: (registrySettings: RegistrySettings) => PacktoryConfiguration;
    readonly createConfigurationModuleText: (registrySettings: RegistrySettings) => string;
}> {
    const definition = parameters.workloads.commandLineInterfaceWorkloads[parameters.size];

    for (let packageIndex = 1; packageIndex <= definition.packageCount; packageIndex += 1) {
        await writeCommandLineInterfacePackageFiles(path.join(parameters.rootDirectory, `package-${packageIndex}`));
    }

    const counts = gatherCommandLineInterfaceCounts(definition.packageCount);
    validateGeneratedCommandLineInterfaceWorkload(definition, counts, parameters.size);

    return {
        rootDirectory: parameters.rootDirectory,
        size: parameters.size,
        definition,
        packageNames: createCommandLineInterfacePackageConfigurations(parameters.rootDirectory, definition.packageCount)
            .map(function (entry) {
                return entry.name;
            }),
        createConfiguration(registrySettings) {
            return createCommandLineInterfaceConfiguration(
                parameters.rootDirectory,
                definition.packageCount,
                registrySettings
            );
        },
        createConfigurationModuleText(registrySettings) {
            const configuration = createCommandLineInterfaceConfiguration(
                parameters.rootDirectory,
                definition.packageCount,
                registrySettings
            );
            return `export const config = ${
                JSON.stringify(configuration, null, javaScriptObjectNotationIndentationSpaces)
            };\n`;
        }
    };
}
