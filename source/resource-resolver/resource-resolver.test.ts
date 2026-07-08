import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, stub, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createDependencyGraph, type DependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    createResourceResolver,
    type ResourceResolver,
    type ResourceResolverDependencies
} from './resource-resolver.ts';

type TransferableFile = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};
type GraphParams = {
    readonly rootFile: string;
    readonly additionalLocalFiles?: readonly string[];
    readonly externalDependencyName?: string;
};
type ResolverFixture = {
    readonly resolver: ResourceResolver;
    readonly scan: SinonSpy;
};
type FileDescriptionCall = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
};
type GeneratedManifestFixture = {
    readonly resolver: ResourceResolver;
    readonly fileManager: FakeFileManager;
    readonly fileDescriptionCalls: readonly FileDescriptionCall[];
};
type ResolvedBundle = Awaited<ReturnType<ResourceResolver['resolve']>>;
type ResolvedContent = ResolvedBundle['contents'][number];

function createTransferableFile(sourceFilePath: string, targetFilePath = sourceFilePath.slice(1)): TransferableFile {
    return {
        sourceFilePath,
        targetFilePath,
        content: `content:${sourceFilePath}`,
        isExecutable: false
    };
}

function createGraph(params: GraphParams): DependencyGraph {
    const { rootFile, additionalLocalFiles = [], externalDependencyName } = params;
    const graph = createDependencyGraph();
    const project = {
        getProject() {
            return 'project';
        }
    };

    graph.addDependency(rootFile, {
        sourceMapFilePath: Maybe.nothing(),
        externalDependencies: externalDependencyName === undefined ? [] : [ externalDependencyName ],
        project: project as never
    });

    for (const localFile of additionalLocalFiles) {
        graph.addDependency(localFile, {
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [],
            project: project as never
        });
        graph.connect(rootFile, localFile);
    }

    return graph;
}

type Overrides = {
    readonly scan?: SinonSpy;
    readonly transferableFileDescriptionResponder?: (
        sourceFilePath: string,
        targetFilePath: string
    ) => TransferableFile;
};

function createResolver(overrides: Overrides = {}): ResolverFixture {
    const scan = overrides.scan ?? fake();
    const responder = overrides.transferableFileDescriptionResponder ?? createTransferableFile;
    const fileManager = createFakeFileManager({
        transferableFileDescriptionResponder(sourceFilePath, targetFilePath) {
            return { value: responder(sourceFilePath, targetFilePath) };
        }
    });

    const dependencies: ResourceResolverDependencies = {
        dependencyScanner: { scan },
        fileManager
    };

    return {
        resolver: createResourceResolver(dependencies),
        scan
    };
}

const baseResolveOptions = {
    name: 'package-a',
    sourcesFolder: '/src',
    roots: { main: { js: '/src/index.js' } } as const,
    includeSourceMapFiles: false,
    additionalFiles: [] as readonly string[],
    mainPackageJson: { type: 'module' as const }
};

function configureScanForJsAndDeclarationGraphs(
    jsGraph: DependencyGraph,
    declarationGraph: DependencyGraph
): SinonSpy {
    const scan = stub();
    scan.onFirstCall().resolves(jsGraph);
    scan.onSecondCall().resolves(declarationGraph);
    return scan;
}

function generatedManifestFixture(graph: DependencyGraph): GeneratedManifestFixture {
    const scan = fake.resolves(graph);
    const fileDescriptionCalls: FileDescriptionCall[] = [];
    const dependencyScanner: ResourceResolverDependencies['dependencyScanner'] = { scan };
    const fileManager = createFakeFileManager({
        transferableFileDescriptionResponder(sourceFilePath, targetFilePath) {
            if (targetFilePath === 'package.json') {
                throw new Error('should not read generated manifest');
            }

            fileDescriptionCalls.push({ sourceFilePath, targetFilePath });
            return { value: createTransferableFile(sourceFilePath, targetFilePath) };
        }
    });

    return {
        resolver: createResourceResolver({ dependencyScanner, fileManager }),
        fileManager,
        fileDescriptionCalls
    };
}

function findGeneratedManifestResource(result: ResolvedBundle): ResolvedContent {
    const manifestResource = result.contents.find(function (entry) {
        return entry.fileDescription.targetFilePath === 'package.json';
    });
    if (manifestResource === undefined) {
        assert.fail('expected generated manifest resource');
    }
    return manifestResource;
}

function addGeneratedManifestDependency(graph: DependencyGraph): void {
    graph.addDependency('/src/package.json', {
        sourceMapFilePath: Maybe.nothing(),
        externalDependencies: [],
        isGeneratedManifest: true
    });
    graph.connect('/src/index.js', '/src/package.json');
}

function assertGeneratedManifestResource(manifestResource: ResolvedContent): void {
    assert.partialDeepStrictEqual(manifestResource, {
        isGeneratedManifest: true,
        fileDescription: {
            content: '{\n    "type": "module"\n}\n',
            isExecutable: false
        }
    });
}

suite('resource-resolver', function () {
    test('resolve() scans js roots and additional files and returns their file descriptions', async function () {
        const jsGraph = createGraph({ rootFile: '/src/index.js', additionalLocalFiles: [ '/src/internal.js' ] });
        const scan = fake.resolves(jsGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            ...baseResolveOptions,
            includeSourceMapFiles: true,
            additionalFiles: [ 'readme.md' ]
        });

        assert.deepStrictEqual(scan.firstCall.args, [
            '/src/index.js',
            '/src',
            {
                includeSourceMapFiles: true,
                resolveDeclarationFiles: false,
                mainPackageJson: { type: 'module' }
            }
        ]);
        assert.partialDeepStrictEqual(result, {
            name: 'package-a',
            contents: {
                length: 3
            },
            roots: {
                main: { js: createTransferableFile('/src/index.js', 'index.js'), declarationFile: undefined }
            }
        });
    });

    test('resolve() keeps declarationFile undefined when a root does not define one', async function () {
        const jsGraph = createGraph({ rootFile: '/src/index.js' });
        const scan = fake.resolves(jsGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve(baseResolveOptions);

        assert.strictEqual(result.roots.main?.declarationFile, undefined);
    });

    test('resolve() synthesizes generated manifest resources instead of reading them from disk', async function () {
        const graph = createGraph({ rootFile: '/src/index.js' });
        addGeneratedManifestDependency(graph);
        const { fileDescriptionCalls, fileManager, resolver } = generatedManifestFixture(graph);

        const result = await resolver.resolve({
            ...baseResolveOptions,
            mainPackageJson: { type: 'module' }
        });
        const manifestResource = findGeneratedManifestResource(result);

        assertGeneratedManifestResource(manifestResource);
        assert.strictEqual(fileManager.getTransferableFileDescriptionCallCount(), 1);
        assert.deepStrictEqual(fileDescriptionCalls, [
            {
                sourceFilePath: '/src/index.js',
                targetFilePath: 'index.js'
            }
        ]);
        assert.deepStrictEqual(fileManager.getTransferableFileDescriptionCall(0), {
            sourceFilePath: '/src/index.js',
            targetFilePath: 'index.js'
        });
    });

    test('resolve() scans declaration roots separately and merges local and external dependencies', async function () {
        const jsGraph = createGraph({
            rootFile: '/src/index.js',
            additionalLocalFiles: [ '/src/shared.js' ],
            externalDependencyName: 'left-pad'
        });
        const declarationGraph = createGraph({
            rootFile: '/src/index.d.ts',
            additionalLocalFiles: [ '/src/shared.js' ],
            externalDependencyName: 'typescript'
        });
        const scan = configureScanForJsAndDeclarationGraphs(jsGraph, declarationGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            name: 'package-a',
            sourcesFolder: '/src',
            roots: { main: { js: '/src/index.js', declarationFile: '/src/index.d.ts' } },
            includeSourceMapFiles: false,
            additionalFiles: [],
            mainPackageJson: { type: 'module' }
        });

        assert.partialDeepStrictEqual(scan, {
            callCount: 2,
            secondCall: {
                args: [
                    '/src/index.d.ts',
                    '/src',
                    {
                        includeSourceMapFiles: false,
                        resolveDeclarationFiles: true,
                        mainPackageJson: { type: 'module' }
                    }
                ]
            }
        });
        assert.deepStrictEqual(
            Array.from(result.externalDependencies.keys()).toSorted(function (left, right) {
                return left.localeCompare(right);
            }),
            [ 'left-pad', 'typescript' ]
        );
        assert.deepStrictEqual(result.roots, {
            main: {
                js: createTransferableFile('/src/index.js', 'index.js'),
                declarationFile: createTransferableFile('/src/index.d.ts', 'index.d.ts')
            }
        });
    });

    test('resolve() preserves additional modern roots', async function () {
        const firstGraph = createGraph({ rootFile: '/src/index.js' });
        const secondGraph = createGraph({ rootFile: '/src/feature.js' });
        const scan = stub();
        scan.onFirstCall().resolves(firstGraph);
        scan.onSecondCall().resolves(secondGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            ...baseResolveOptions,
            roots: {
                main: { js: '/src/index.js' },
                feature: { js: '/src/feature.js' }
            }
        });

        assert.deepStrictEqual(result.roots, {
            main: { js: createTransferableFile('/src/index.js', 'index.js'), declarationFile: undefined },
            feature: { js: createTransferableFile('/src/feature.js', 'feature.js'), declarationFile: undefined }
        });
    });

    test('resolve() throws when a root resource cannot be resolved from the scanned contents', async function () {
        const graph = createGraph({ rootFile: '/src/index.js' });
        const scan = fake.resolves(graph);
        const { resolver } = createResolver({
            scan,
            transferableFileDescriptionResponder() {
                return createTransferableFile('/src/not-the-entry.js');
            }
        });

        try {
            await resolver.resolve({
                name: 'package-a',
                sourcesFolder: '/src',
                roots: { main: { js: '/src/index.js' } },
                includeSourceMapFiles: false,
                additionalFiles: [],
                mainPackageJson: { type: 'module' }
            });
            assert.fail('Expected resolve() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve resource for root /src/index.js');
        }
    });

    test('resolve() throws when a declared root resource cannot be resolved from the scanned contents', async function () {
        const graph = createGraph({ rootFile: '/src/missing.js' });
        const scan = fake.resolves(graph);
        const { resolver } = createResolver({
            scan,
            transferableFileDescriptionResponder() {
                return createTransferableFile('/src/index.js');
            }
        });

        try {
            await resolver.resolve({
                ...baseResolveOptions,
                roots: { main: { js: '/src/missing.js' } }
            });
            assert.fail('Expected resolve() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve resource for root /src/missing.js');
        }
    });
});
