/* eslint-disable @typescript-eslint/explicit-function-return-type, destructuring/in-params, max-statements, functional/prefer-tacit -- resolver tests use compact inline stubs to cover the public API paths */
import assert from 'node:assert';
import { test } from 'mocha';
import { fake, stub, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import { createDependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import {
    createResourceResolver,
    type ResourceResolver,
    type ResourceResolverDependencies
} from './resource-resolver.ts';

function createTransferableFile(sourceFilePath: string, targetFilePath = sourceFilePath.slice(1)) {
    return {
        sourceFilePath,
        targetFilePath,
        content: `content:${sourceFilePath}`,
        isExecutable: false
    };
}

function createGraph({
    rootFile,
    additionalLocalFiles = [],
    externalDependencyName
}: {
    readonly rootFile: string;
    readonly additionalLocalFiles?: readonly string[];
    readonly externalDependencyName?: string;
}) {
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
    readonly getTransferableFileDescriptionFromPath?: SinonSpy;
};

function createResolver(overrides: Overrides = {}): {
    readonly resolver: ResourceResolver;
    readonly scan: SinonSpy;
    readonly getTransferableFileDescriptionFromPath: SinonSpy;
} {
    const scan = overrides.scan ?? fake();
    const getTransferableFileDescriptionFromPath =
        overrides.getTransferableFileDescriptionFromPath ??
        fake(async (sourceFilePath: string, targetFilePath: string) => {
            return createTransferableFile(sourceFilePath, targetFilePath);
        });

    const dependencies = {
        dependencyScanner: { scan },
        fileManager: { getTransferableFileDescriptionFromPath }
    } as unknown as ResourceResolverDependencies;

    return {
        resolver: createResourceResolver(dependencies),
        scan,
        getTransferableFileDescriptionFromPath
    };
}

test('resolve() scans js entry points and additional files and returns their file descriptions', async () => {
    const jsGraph = createGraph({ rootFile: '/src/index.js', additionalLocalFiles: ['/src/internal.js'] });
    const scan = fake.resolves(jsGraph);
    const { resolver } = createResolver({ scan });

    const result = await resolver.resolve({
        name: 'package-a',
        sourcesFolder: '/src',
        entryPoints: [{ js: '/src/index.js' }],
        includeSourceMapFiles: true,
        additionalFiles: ['readme.md'],
        moduleResolution: 'module'
    });

    assert.deepStrictEqual(scan.firstCall.args, [
        '/src/index.js',
        '/src',
        { includeSourceMapFiles: true, resolveDeclarationFiles: false, moduleResolution: 'module' }
    ]);
    assert.strictEqual(result.name, 'package-a');
    assert.strictEqual(result.contents.length, 3);
    assert.deepStrictEqual(result.entryPoints, [
        { js: createTransferableFile('/src/index.js', 'index.js'), declarationFile: undefined }
    ]);
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
    const scan = stub();
    scan.onFirstCall().resolves(jsGraph);
    scan.onSecondCall().resolves(declarationGraph);
    const { resolver } = createResolver({ scan });

    const result = await resolver.resolve({
        name: 'package-a',
        sourcesFolder: '/src',
        entryPoints: [{ js: '/src/index.js', declarationFile: '/src/index.d.ts' }],
        includeSourceMapFiles: false,
        additionalFiles: [],
        moduleResolution: 'module'
    });

    assert.strictEqual(scan.callCount, 2);
    assert.deepStrictEqual(scan.secondCall.args, [
        '/src/index.d.ts',
        '/src',
        { includeSourceMapFiles: false, resolveDeclarationFiles: true, moduleResolution: 'module' }
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
        getTransferableFileDescriptionFromPath: fake(async () => {
            return createTransferableFile('/src/not-the-entry.js');
        })
    });

    try {
        await resolver.resolve({
            name: 'package-a',
            sourcesFolder: '/src',
            entryPoints: [{ js: '/src/index.js' }],
            includeSourceMapFiles: false,
            additionalFiles: [],
            moduleResolution: 'module'
        });
        assert.fail('Expected resolve() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to resolve resource for entry point /src/index.js');
    }
});
