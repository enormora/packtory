import assert from 'node:assert';
import { test } from 'mocha';
import { fake, stub, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createDependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
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

function createTransferableFile(sourceFilePath: string, targetFilePath = sourceFilePath.slice(1)): TransferableFile {
    return {
        sourceFilePath,
        targetFilePath,
        content: `content:${sourceFilePath}`,
        isExecutable: false
    };
}

function createGraph(params: {
    readonly rootFile: string;
    readonly additionalLocalFiles?: readonly string[];
    readonly externalDependencyName?: string;
}): ReturnType<typeof createDependencyGraph> {
    const { rootFile, additionalLocalFiles = [], externalDependencyName } = params;
    const graph = createDependencyGraph();
    const project = {
        getProject: () => {
            return 'project';
        }
    };

    graph.addDependency(rootFile, {
        sourceMapFilePath: Maybe.nothing(),
        externalDependencies: externalDependencyName === undefined ? [] : [externalDependencyName],
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

function createResolver(overrides: Overrides = {}): {
    readonly resolver: ResourceResolver;
    readonly scan: SinonSpy;
} {
    const scan = overrides.scan ?? fake();
    const responder = overrides.transferableFileDescriptionResponder ?? createTransferableFile;
    const fileManager = createFakeFileManager({
        transferableFileDescriptionResponder: (sourceFilePath, targetFilePath) => {
            return { value: responder(sourceFilePath, targetFilePath) };
        }
    });

    const dependencies: ResourceResolverDependencies = {
        dependencyScanner: { scan } as unknown as ResourceResolverDependencies['dependencyScanner'],
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
    entryPoints: [{ js: '/src/index.js' }] as const,
    includeSourceMapFiles: false,
    additionalFiles: [] as readonly string[],
    mainPackageJson: { type: 'module' as const }
};

function configureScanForJsAndDeclarationGraphs(
    jsGraph: ReturnType<typeof createDependencyGraph>,
    declarationGraph: ReturnType<typeof createDependencyGraph>
): SinonSpy {
    const scan = stub();
    scan.onFirstCall().resolves(jsGraph);
    scan.onSecondCall().resolves(declarationGraph);
    return scan;
}

test('resolve() scans js entry points and additional files and returns their file descriptions', async () => {
    const jsGraph = createGraph({ rootFile: '/src/index.js', additionalLocalFiles: ['/src/internal.js'] });
    const scan = fake.resolves(jsGraph);
    const { resolver } = createResolver({ scan });

    const result = await resolver.resolve({
        ...baseResolveOptions,
        includeSourceMapFiles: true,
        additionalFiles: ['readme.md']
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
    assert.strictEqual(result.name, 'package-a');
    assert.strictEqual(result.contents.length, 3);
    assert.deepStrictEqual(result.entryPoints, [
        { js: createTransferableFile('/src/index.js', 'index.js'), declarationFile: undefined }
    ]);
});

test('resolve() keeps declarationFile undefined when an entry point does not define one', async () => {
    const jsGraph = createGraph({ rootFile: '/src/index.js' });
    const scan = fake.resolves(jsGraph);
    const { resolver } = createResolver({ scan });

    const result = await resolver.resolve(baseResolveOptions);

    assert.strictEqual(result.entryPoints[0].declarationFile, undefined);
});

test('resolve() scans declaration entry points separately and merges local and external dependencies', async () => {
    const jsGraph = createGraph({
        rootFile: '/src/index.js',
        additionalLocalFiles: ['/src/shared.js'],
        externalDependencyName: 'left-pad'
    });
    const declarationGraph = createGraph({
        rootFile: '/src/index.d.ts',
        additionalLocalFiles: ['/src/shared.js'],
        externalDependencyName: 'typescript'
    });
    const scan = configureScanForJsAndDeclarationGraphs(jsGraph, declarationGraph);
    const { resolver } = createResolver({ scan });

    const result = await resolver.resolve({
        name: 'package-a',
        sourcesFolder: '/src',
        entryPoints: [{ js: '/src/index.js', declarationFile: '/src/index.d.ts' }],
        includeSourceMapFiles: false,
        additionalFiles: [],
        mainPackageJson: { type: 'module' }
    });

    assert.strictEqual(scan.callCount, 2);
    assert.deepStrictEqual(scan.secondCall.args, [
        '/src/index.d.ts',
        '/src',
        {
            includeSourceMapFiles: false,
            resolveDeclarationFiles: true,
            mainPackageJson: { type: 'module' }
        }
    ]);
    assert.deepStrictEqual(
        Array.from(result.externalDependencies.keys()).toSorted((left, right) => {
            return left.localeCompare(right);
        }),
        ['left-pad', 'typescript']
    );
    assert.deepStrictEqual(result.entryPoints, [
        {
            js: createTransferableFile('/src/index.js', 'index.js'),
            declarationFile: createTransferableFile('/src/index.d.ts', 'index.d.ts')
        }
    ]);
});

test('resolve() throws when an entry point resource cannot be resolved from the scanned contents', async () => {
    const graph = createGraph({ rootFile: '/src/index.js' });
    const scan = fake.resolves(graph);
    const { resolver } = createResolver({
        scan,
        transferableFileDescriptionResponder: () => {
            return createTransferableFile('/src/not-the-entry.js');
        }
    });

    try {
        await resolver.resolve({
            name: 'package-a',
            sourcesFolder: '/src',
            entryPoints: [{ js: '/src/index.js' }],
            includeSourceMapFiles: false,
            additionalFiles: [],
            mainPackageJson: { type: 'module' }
        });
        assert.fail('Expected resolve() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to resolve resource for entry point /src/index.js');
    }
});
