import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, stub, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { createDependencyGraph, type DependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import { createFakeFileManager, type FakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    createResourceResolver,
    type ResourceResolver,
    type ResourceResolverDependencies
} from './resource-resolver.ts';

type TransferableFile = {
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};
type GraphInput = {
    readonly rootFile: string;
    readonly additionalLocalFiles?: readonly string[];
    readonly externalDependencyName?: string;
};
type ResolverFixture = {
    readonly resolver: ResourceResolver;
    readonly scan: SinonSpy;
};
type FileDescriptionCall = {
    readonly inputFilePath: string;
    readonly targetFilePath: string;
};
type GeneratedManifestFixture = {
    readonly resolver: ResourceResolver;
    readonly fileManager: FakeFileManager;
    readonly fileDescriptionCalls: readonly FileDescriptionCall[];
};
type ResolvedBundle = Awaited<ReturnType<ResourceResolver['resolve']>>;
type ResolvedContent = ResolvedBundle['contents'][number];

function createTransferableFile(inputFilePath: string, targetFilePath = inputFilePath.slice(1)): TransferableFile {
    return {
        inputFilePath,
        targetFilePath,
        content: `content:${inputFilePath}`,
        isExecutable: false
    };
}

function createGraph(input: GraphInput): DependencyGraph {
    const { rootFile, additionalLocalFiles = [], externalDependencyName } = input;
    const graph = createDependencyGraph();
    const project = {
        getProject() {
            return 'project';
        }
    };

    graph.addDependency(rootFile, {
        sourceMapFilePath: Maybe.nothing(),
        externalDependencies: externalDependencyName === undefined ? [] : [ {
            name: externalDependencyName,
            sourceSpecifier: externalDependencyName,
            emittedSpecifier: externalDependencyName
        } ],
        moduleReferences: [],
        project: project as never
    });

    for (const localFile of additionalLocalFiles) {
        graph.addDependency(localFile, {
            sourceMapFilePath: Maybe.nothing(),
            externalDependencies: [],
            moduleReferences: [],
            project: project as never
        });
        graph.connect(rootFile, localFile);
    }

    return graph;
}

type Overrides = {
    readonly readableFiles?: readonly string[];
    readonly scan?: SinonSpy;
    readonly transferableFileDescriptionResponder?: (
        inputFilePath: string,
        targetFilePath: string
    ) => TransferableFile;
};

function createResolver(overrides: Overrides = {}): ResolverFixture {
    const scan = overrides.scan ?? fake();
    const scanEntries = fake(async function (
        entries: readonly string[],
        sourcesFolder: string,
        options: Parameters<ResourceResolverDependencies['dependencyScanner']['scanEntries']>[2]
    ) {
        const [ entry ] = entries;
        if (entry === undefined) {
            throw new Error('Expected at least one scanner entry');
        }
        const result: unknown = await scan(entry, sourcesFolder, options);
        return result as DependencyGraph;
    });
    const responder = overrides.transferableFileDescriptionResponder ?? createTransferableFile;
    const baseFileManager = createFakeFileManager({
        transferableFileDescriptionResponder(inputFilePath, targetFilePath) {
            return { value: responder(inputFilePath, targetFilePath) };
        }
    });
    const readableFiles = overrides.readableFiles === undefined
        ? new Set<string>()
        : new Set(overrides.readableFiles);
    const fileManager = {
        ...baseFileManager,
        async checkReadability(fileOrFolderPath: string) {
            return { isReadable: readableFiles.has(fileOrFolderPath) };
        }
    };

    const dependencies: ResourceResolverDependencies = {
        dependencyScanner: { scan, scanEntries },
        fileManager
    };

    return {
        resolver: createResourceResolver(dependencies),
        scan
    };
}

const baseResolveOptions = {
    name: 'package-a',
    sourcesFolder: '/source',
    roots: { main: { javaScript: '/source/index.js' } } as const,
    includeSourceMapFiles: false,
    additionalFiles: [] as readonly string[],
    mainPackageManifest: { type: 'module' as const }
};

function configureScanForJavaScriptAndDeclarationGraphs(
    javaScriptGraph: DependencyGraph,
    declarationGraph: DependencyGraph
): SinonSpy {
    const scan = stub();
    scan.onFirstCall().resolves(javaScriptGraph);
    scan.onSecondCall().resolves(declarationGraph);
    return scan;
}

function configureScanForThreeGraphs(
    firstGraph: DependencyGraph,
    secondGraph: DependencyGraph,
    thirdGraph: DependencyGraph
): SinonSpy {
    const scan = stub();
    scan.onFirstCall().resolves(firstGraph);
    scan.onSecondCall().resolves(secondGraph);
    scan.onThirdCall().resolves(thirdGraph);
    return scan;
}

function configureScanForFourGraphs(
    firstGraph: DependencyGraph,
    secondGraph: DependencyGraph,
    thirdGraph: DependencyGraph,
    fourthGraph: DependencyGraph
): SinonSpy {
    const graphs = [ firstGraph, secondGraph, thirdGraph, fourthGraph ];
    let index = 0;
    return fake(async function (): Promise<DependencyGraph> {
        const graph = graphs[index];
        index += 1;
        if (graph === undefined) {
            throw new Error('Unexpected scan call');
        }
        return graph;
    });
}

function typedBaseResolveOptions(): typeof baseResolveOptions & {
    readonly roots: {
        readonly main: { readonly javaScript: '/source/index.js'; readonly declarationFile: '/source/index.d.ts'; };
    };
} {
    return {
        ...baseResolveOptions,
        roots: { main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' } }
    };
}

function hasContentSourcePath(result: ResolvedBundle, inputFilePath: string): boolean {
    return result.contents.some(function (entry) {
        return entry.fileDescription.inputFilePath === inputFilePath;
    });
}

function assertPromotedDeclarationScan(scan: SinonSpy, inputFilePath: string): void {
    assertDeepSubset(scan, {
        callCount: 3,
        thirdCall: {
            arguments: [
                inputFilePath,
                '/source',
                {
                    includeSourceMapFiles: false,
                    resolveDeclarationFiles: true,
                    mainPackageManifest: { type: 'module' }
                }
            ]
        }
    });
}

function assertFourthPromotedDeclarationScan(scan: SinonSpy, inputFilePath: string): void {
    assert.strictEqual(scan.callCount, 4);
    assert.deepStrictEqual(scan.getCall(3).args, [
        inputFilePath,
        '/source',
        {
            includeSourceMapFiles: false,
            resolveDeclarationFiles: true,
            mainPackageManifest: { type: 'module' }
        }
    ]);
}

function generatedManifestFixture(graph: DependencyGraph): GeneratedManifestFixture {
    const scan = fake.resolves(graph);
    const scanEntries = fake.resolves(graph);
    const fileDescriptionCalls: FileDescriptionCall[] = [];
    const dependencyScanner: ResourceResolverDependencies['dependencyScanner'] = { scan, scanEntries };
    const fileManager = createFakeFileManager({
        transferableFileDescriptionResponder(inputFilePath, targetFilePath) {
            if (targetFilePath === 'package.json') {
                throw new Error('should not read generated manifest');
            }

            fileDescriptionCalls.push({ inputFilePath, targetFilePath });
            return { value: createTransferableFile(inputFilePath, targetFilePath) };
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
    graph.addDependency('/source/package.json', {
        sourceMapFilePath: Maybe.nothing(),
        externalDependencies: [],
        moduleReferences: [],
        isGeneratedManifest: true
    });
    graph.connect('/source/index.js', '/source/package.json');
}

function assertGeneratedManifestResource(manifestResource: ResolvedContent): void {
    assertDeepSubset(manifestResource, {
        isGeneratedManifest: true,
        fileDescription: {
            content: '{\n    "type": "module"\n}\n',
            isExecutable: false
        }
    });
}

suite('resource-resolver', function () {
    test('resolve() scans js roots and additional files and returns their file descriptions', async function () {
        const javaScriptGraph = createGraph({
            rootFile: '/source/index.js',
            additionalLocalFiles: [ '/source/internal.js' ]
        });
        const scan = fake.resolves(javaScriptGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            ...baseResolveOptions,
            includeSourceMapFiles: true,
            additionalFiles: [ 'readme.md' ]
        });

        assert.deepStrictEqual(scan.firstCall.args, [
            '/source/index.js',
            '/source',
            {
                includeSourceMapFiles: true,
                resolveDeclarationFiles: false,
                mainPackageManifest: { type: 'module' }
            }
        ]);
        assertDeepSubset(result, {
            name: 'package-a',
            contents: {
                length: 3
            },
            roots: {
                main: { javaScript: createTransferableFile('/source/index.js', 'index.js'), declarationFile: undefined }
            }
        });
    });

    test('resolve() keeps declarationFile undefined when a root does not define one', async function () {
        const javaScriptGraph = createGraph({ rootFile: '/source/index.js' });
        const scan = fake.resolves(javaScriptGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve(baseResolveOptions);

        assert.strictEqual(result.roots.main?.declarationFile, undefined);
    });

    test('resolve() synthesizes generated manifest resources instead of reading them from disk', async function () {
        const graph = createGraph({ rootFile: '/source/index.js' });
        addGeneratedManifestDependency(graph);
        const { fileDescriptionCalls, fileManager, resolver } = generatedManifestFixture(graph);

        const result = await resolver.resolve({
            ...baseResolveOptions,
            mainPackageManifest: { type: 'module' }
        });
        const manifestResource = findGeneratedManifestResource(result);

        assertGeneratedManifestResource(manifestResource);
        assert.strictEqual(fileManager.getTransferableFileDescriptionCallCount(), 1);
        assert.deepStrictEqual(fileDescriptionCalls, [
            {
                inputFilePath: '/source/index.js',
                targetFilePath: 'index.js'
            }
        ]);
        assert.deepStrictEqual(fileManager.getTransferableFileDescriptionCall(0), {
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js'
        });
    });

    test('resolve() scans declaration roots separately and merges local and external dependencies', async function () {
        const javaScriptGraph = createGraph({
            rootFile: '/source/index.js',
            additionalLocalFiles: [ '/source/shared.js' ],
            externalDependencyName: 'left-pad'
        });
        const declarationGraph = createGraph({
            rootFile: '/source/index.d.ts',
            additionalLocalFiles: [ '/source/shared.js' ],
            externalDependencyName: 'typescript'
        });
        const scan = configureScanForJavaScriptAndDeclarationGraphs(javaScriptGraph, declarationGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            name: 'package-a',
            sourcesFolder: '/source',
            roots: { main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' } },
            includeSourceMapFiles: false,
            additionalFiles: [],
            mainPackageManifest: { type: 'module' }
        });

        assertDeepSubset(scan, {
            callCount: 2,
            secondCall: {
                arguments: [
                    '/source/index.d.ts',
                    '/source',
                    {
                        includeSourceMapFiles: false,
                        resolveDeclarationFiles: true,
                        mainPackageManifest: { type: 'module' }
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
                javaScript: createTransferableFile('/source/index.js', 'index.js'),
                declarationFile: createTransferableFile('/source/index.d.ts', 'index.d.ts')
            }
        });
    });

    suite('promoted declaration companions', function () {
        test('scans readable companions for typed packages', async function () {
            const promotedDeclarationGraph = createGraph({ rootFile: '/source/feature.d.ts' });
            const scan = configureScanForThreeGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' }),
                promotedDeclarationGraph
            );
            const { resolver } = createResolver({ readableFiles: [ '/source/feature.d.ts' ], scan });

            const result = await resolver.resolveWithPromotedDeclarationCompanions(
                typedBaseResolveOptions(),
                new Set([ '/source/feature.js' ])
            );

            assertPromotedDeclarationScan(scan, '/source/feature.d.ts');
            assert.strictEqual(hasContentSourcePath(result, '/source/feature.d.ts'), true);
        });

        test('uses the first readable companion candidate', async function () {
            const scan = configureScanForThreeGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' }),
                createGraph({ rootFile: '/source/module.d.ts' })
            );
            const { resolver } = createResolver({ readableFiles: [ '/source/module.d.ts' ], scan });

            await resolver.resolveWithPromotedDeclarationCompanions(
                typedBaseResolveOptions(),
                new Set([ '/source/module.mjs' ])
            );

            assert.deepStrictEqual(scan.thirdCall.args[0], '/source/module.d.ts');
        });

        test('skips unreadable companions', async function () {
            const scan = configureScanForJavaScriptAndDeclarationGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' })
            );
            const { resolver } = createResolver({ scan });

            await resolver.resolveWithPromotedDeclarationCompanions(
                typedBaseResolveOptions(),
                new Set([ '/source/feature.js' ])
            );

            assert.strictEqual(scan.callCount, 2);
        });

        test('ignores promoted source paths for untyped packages', async function () {
            const scan = fake.resolves(createGraph({ rootFile: '/source/index.js' }));
            const { resolver } = createResolver({ readableFiles: [ '/source/feature.d.ts' ], scan });

            await resolver.resolveWithPromotedDeclarationCompanions(
                baseResolveOptions,
                new Set([ '/source/feature.js' ])
            );

            assert.strictEqual(scan.callCount, 1);
        });

        test('scans promoted companions when one root among many has declarations', async function () {
            const scan = configureScanForFourGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' }),
                createGraph({ rootFile: '/source/other.js' }),
                createGraph({ rootFile: '/source/feature.d.ts' })
            );
            const { resolver } = createResolver({ readableFiles: [ '/source/feature.d.ts' ], scan });

            await resolver.resolveWithPromotedDeclarationCompanions({
                ...baseResolveOptions,
                roots: {
                    main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' },
                    other: { javaScript: '/source/other.js' }
                }
            }, new Set([ '/source/feature.js' ]));

            assertFourthPromotedDeclarationScan(scan, '/source/feature.d.ts');
        });
    });

    test('resolve() preserves additional modern roots', async function () {
        const firstGraph = createGraph({ rootFile: '/source/index.js' });
        const secondGraph = createGraph({ rootFile: '/source/feature.js' });
        const scan = stub();
        scan.onFirstCall().resolves(firstGraph);
        scan.onSecondCall().resolves(secondGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            ...baseResolveOptions,
            roots: {
                main: { javaScript: '/source/index.js' },
                feature: { javaScript: '/source/feature.js' }
            }
        });

        assert.deepStrictEqual(result.roots, {
            main: { javaScript: createTransferableFile('/source/index.js', 'index.js'), declarationFile: undefined },
            feature: {
                javaScript: createTransferableFile('/source/feature.js', 'feature.js'),
                declarationFile: undefined
            }
        });
    });

    test('resolve() throws when a root resource cannot be resolved from the scanned contents', async function () {
        const graph = createGraph({ rootFile: '/source/index.js' });
        const scan = fake.resolves(graph);
        const { resolver } = createResolver({
            scan,
            transferableFileDescriptionResponder() {
                return createTransferableFile('/source/not-the-entry.js');
            }
        });

        try {
            await resolver.resolve({
                name: 'package-a',
                sourcesFolder: '/source',
                roots: { main: { javaScript: '/source/index.js' } },
                includeSourceMapFiles: false,
                additionalFiles: [],
                mainPackageManifest: { type: 'module' }
            });
            assert.fail('Expected resolve() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve resource for root /source/index.js');
        }
    });

    test('resolve() throws when a declared root resource cannot be resolved from the scanned contents', async function () {
        const graph = createGraph({ rootFile: '/source/missing.js' });
        const scan = fake.resolves(graph);
        const { resolver } = createResolver({
            scan,
            transferableFileDescriptionResponder() {
                return createTransferableFile('/source/index.js');
            }
        });

        try {
            await resolver.resolve({
                ...baseResolveOptions,
                roots: { main: { javaScript: '/source/missing.js' } }
            });
            assert.fail('Expected resolve() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve resource for root /source/missing.js');
        }
    });
});
