import assert from 'node:assert';
import { fake, stub, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createDependencyGraph, type DependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import {
    createResourceResolver,
    type ResourceResolver,
    type ResourceResolverDependencies
} from '../resource-resolver/resource-resolver.ts';
import { assertDeepSubset } from './deep-subset-assertion.ts';
import { createFakeFileManager, type FakeFileManager } from './fake-file-manager.ts';

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

export function createTransferableFile(
    inputFilePath: string,
    targetFilePath = inputFilePath.slice(1)
): TransferableFile {
    return {
        inputFilePath,
        targetFilePath,
        content: `content:${inputFilePath}`,
        isExecutable: false
    };
}

export function createGraph(input: GraphInput): DependencyGraph {
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

export function createResolver(overrides: Overrides = {}): ResolverFixture {
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
        const firstResult: unknown = await scan(entry, sourcesFolder, options);
        const graph = firstResult as DependencyGraph;
        const graphs = new Map<string, DependencyGraph>([ [ entry, graph ] ]);
        for (const entryFile of entries.slice(1)) {
            const result: unknown = await scan(entryFile, sourcesFolder, options);
            graphs.set(entryFile, result as DependencyGraph);
        }
        return {
            ...graph,
            flatten(entryFile: string) {
                const entryGraph = graphs.get(entryFile);
                if (entryGraph === undefined) {
                    throw new Error('Missing entry graph');
                }
                return entryGraph.flatten(entryFile);
            }
        };
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

export const baseResolveOptions = {
    name: 'package-a',
    sourcesFolder: '/source',
    roots: { main: { javaScript: '/source/index.js' } } as const,
    includeSourceMapFiles: false,
    additionalFiles: [] as readonly string[],
    mainPackageManifest: { type: 'module' as const }
};

export function configureScanForJavaScriptAndDeclarationGraphs(
    javaScriptGraph: DependencyGraph,
    declarationGraph: DependencyGraph
): SinonSpy {
    const scan = stub();
    scan.onFirstCall().resolves(javaScriptGraph);
    scan.onSecondCall().resolves(declarationGraph);
    return scan;
}

export function configureScanForThreeGraphs(
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

export function configureScanForFourGraphs(
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

export function typedBaseResolveOptions(): typeof baseResolveOptions & {
    readonly roots: {
        readonly main: { readonly javaScript: '/source/index.js'; readonly declarationFile: '/source/index.d.ts'; };
    };
} {
    return {
        ...baseResolveOptions,
        roots: { main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' } }
    };
}

export function hasContentSourcePath(result: ResolvedBundle, inputFilePath: string): boolean {
    return result.contents.some(function (entry) {
        return entry.fileDescription.inputFilePath === inputFilePath;
    });
}

export function assertPromotedDeclarationScan(scan: SinonSpy, inputFilePath: string): void {
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

export function assertFourthPromotedDeclarationScan(scan: SinonSpy, inputFilePath: string): void {
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

export function generatedManifestFixture(graph: DependencyGraph): GeneratedManifestFixture {
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

export function findGeneratedManifestResource(result: ResolvedBundle): ResolvedContent {
    const manifestResource = result.contents.find(function (entry) {
        return entry.fileDescription.targetFilePath === 'package.json';
    });
    if (manifestResource === undefined) {
        assert.fail('expected generated manifest resource');
    }
    return manifestResource;
}

export function addGeneratedManifestDependency(graph: DependencyGraph): void {
    graph.addDependency('/source/package.json', {
        sourceMapFilePath: Maybe.nothing(),
        externalDependencies: [],
        moduleReferences: [],
        isGeneratedManifest: true
    });
    graph.connect('/source/index.js', '/source/package.json');
}

export function assertGeneratedManifestResource(manifestResource: ResolvedContent): void {
    assertDeepSubset(manifestResource, {
        isGeneratedManifest: true,
        fileDescription: {
            content: '{\n    "type": "module"\n}\n',
            isExecutable: false
        }
    });
}
