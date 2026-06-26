import assert from 'node:assert';
import { suite, test } from 'mocha';
import { stub, fake, type SinonSpy } from 'sinon';
import { Maybe } from 'true-myth';
import type { MainPackageJson } from '../config/package-json.ts';
import type { DependencyFiles } from './dependency-graph.ts';
import type { ModuleReference } from './source-file-references.ts';
import { createDependencyScanner, type DependencyScanner, type DependencyScannerDependencies } from './scanner.ts';

const defaultMainPackageJson: MainPackageJson = { type: 'module' };

type ProjectOverrides = {
    readonly getReferencedModules?: SinonSpy;
    readonly getProject?: SinonSpy;
};

function createFakeAnalyzeProject(overrides: ProjectOverrides = {}): Readonly<SinonSpy> {
    const { getReferencedModules = fake.returns([]), getProject = fake.returns({}) } = overrides;

    return fake.returns({
        getReferencedModules,
        getProject
    });
}

type Overrides = {
    readonly locate?: SinonSpy;
    readonly analyzeProject?: Readonly<SinonSpy>;
};

function dependencyScannerFactory(overrides: Overrides = {}): DependencyScanner {
    const { analyzeProject = createFakeAnalyzeProject(), locate = fake.resolves(Maybe.nothing()) } = overrides;
    const fakeDependencies = {
        sourceMapFileLocator: { locate },
        typescriptProjectAnalyzer: { analyzeProject }
    } as unknown as DependencyScannerDependencies;

    return createDependencyScanner(fakeDependencies);
}

function localCode(filePath: string): ModuleReference {
    return { kind: 'local-code', filePath };
}

function localAsset(filePath: string): ModuleReference {
    return { kind: 'local-asset', filePath };
}

function externalPackage(packageName: string): ModuleReference {
    return { kind: 'external-package', packageName };
}

function generatedManifest(filePath: string): ModuleReference {
    return { kind: 'generated-manifest', filePath };
}

suite('scanner', function () {
    test('analyzes the given entryPoint file in the given folder as a typescript project', async function () {
        const analyzeProject = createFakeAnalyzeProject();
        const dependencyScanner = dependencyScannerFactory({ analyzeProject });

        await dependencyScanner.scan('/foo/bar.js', '/foo', { mainPackageJson: defaultMainPackageJson });

        assert.strictEqual(analyzeProject.callCount, 1);
        assert.deepStrictEqual(analyzeProject.firstCall.args, [
            '/foo',
            { resolveDeclarationFiles: false, mainPackageJson: defaultMainPackageJson }
        ]);
    });

    test('passes the resolveDeclarationFiles option to the project analyzer', async function () {
        const analyzeProject = createFakeAnalyzeProject();
        const dependencyScanner = dependencyScannerFactory({ analyzeProject });

        await dependencyScanner.scan('/foo/bar.js', '/foo', {
            resolveDeclarationFiles: true,
            mainPackageJson: defaultMainPackageJson
        });

        assert.strictEqual(analyzeProject.callCount, 1);
        assert.deepStrictEqual(analyzeProject.firstCall.args, [
            '/foo',
            { resolveDeclarationFiles: true, mainPackageJson: defaultMainPackageJson }
        ]);
    });

    test('scans the dependencies of the given entryPoint file', async function () {
        const getReferencedModules = fake.returns([]);
        const analyzeProject = createFakeAnalyzeProject({ getReferencedModules });
        const dependencyScanner = dependencyScannerFactory({ analyzeProject });

        await dependencyScanner.scan('/foo/bar.js', '/foo', { mainPackageJson: defaultMainPackageJson });

        assert.strictEqual(getReferencedModules.callCount, 1);
        assert.deepStrictEqual(getReferencedModules.firstCall.args, ['/foo/bar.js']);
    });

    async function expectScanReturnsOnlyEntry(scanArgs: Parameters<DependencyScanner['scan']>): Promise<void> {
        const getReferencedModules = fake.returns([]);
        const analyzeProject = createFakeAnalyzeProject({ getReferencedModules });
        const dependencyScanner = dependencyScannerFactory({
            analyzeProject,
            locate: fake.resolves(Maybe.just('/dir/foo.map'))
        });

        const graph = await dependencyScanner.scan(...scanArgs);
        const result = graph.flatten('/dir/entry.js');

        assert.deepStrictEqual(result, {
            localFiles: [{ directDependencies: new Set(), filePath: '/dir/entry.js', project: {} }],
            externalDependencies: new Map()
        });
    }

    test('returns no dependencies if the given file doesn’t have any dependencies', async function () {
        await expectScanReturnsOnlyEntry(['/dir/entry.js', '/dir', { mainPackageJson: defaultMainPackageJson }]);
    });

    test('doesn’t try to locate source map files by default', async function () {
        const locate = fake.resolves(Maybe.nothing());
        const dependencyScanner = dependencyScannerFactory({ locate });

        await dependencyScanner.scan('/dir/entry.js', '/dir', { mainPackageJson: defaultMainPackageJson });

        assert.strictEqual(locate.callCount, 0);
    });

    test('tries to locate source map files only for code files when includeSourceMapFiles is true', async function () {
        const locate = fake.resolves(Maybe.nothing());
        const getReferencedModules = stub()
            .onFirstCall()
            .returns([localCode('/dir/foo.js')])
            .onSecondCall()
            .returns([localAsset('/dir/data.json'), generatedManifest('/dir/package.json')])
            .onThirdCall()
            .returns([]);
        const analyzeProject = createFakeAnalyzeProject({ getReferencedModules });
        const dependencyScanner = dependencyScannerFactory({ analyzeProject, locate });

        await dependencyScanner.scan('/dir/entry.js', '/dir', {
            includeSourceMapFiles: true,
            mainPackageJson: defaultMainPackageJson
        });

        assert.strictEqual(locate.callCount, 2);
        assert.deepStrictEqual(locate.firstCall.args, ['/dir/entry.js', '/dir']);
        assert.deepStrictEqual(locate.secondCall.args, ['/dir/foo.js', '/dir']);
    });

    async function scanWithSourceMapLocate(locate: SinonSpy): Promise<DependencyFiles> {
        const getReferencedModules = fake.returns([]);
        const analyzeProject = createFakeAnalyzeProject({ getReferencedModules });
        const dependencyScanner = dependencyScannerFactory({ analyzeProject, locate });

        const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
            includeSourceMapFiles: true,
            mainPackageJson: defaultMainPackageJson
        });
        return graph.flatten('/dir/entry.js');
    }

    test('returns no additional dependencies for source maps if they don’t exist', async function () {
        const locate = fake.resolves(Maybe.nothing());
        const result = await scanWithSourceMapLocate(locate);

        assert.strictEqual(locate.callCount, 1);
        assert.deepStrictEqual(result, {
            localFiles: [{ directDependencies: new Set(), filePath: '/dir/entry.js', project: {} }],
            externalDependencies: new Map()
        });
    });

    test('returns additional dependencies for source maps if they exist', async function () {
        const result = await scanWithSourceMapLocate(fake.resolves(Maybe.just('/dir/foo.map')));

        assert.deepStrictEqual(result, {
            localFiles: [
                { directDependencies: new Set(), filePath: '/dir/foo.map', project: {} },
                { directDependencies: new Set(['/dir/foo.map']), filePath: '/dir/entry.js', project: {} }
            ],
            externalDependencies: new Map()
        });
    });

    test('returns the local dependency files', async function () {
        const getReferencedModules = fake.returns([localCode('/dir/foo.js'), localCode('/dir/bar.js')]);
        const analyzeProject = createFakeAnalyzeProject({ getReferencedModules });
        const dependencyScanner = dependencyScannerFactory({ analyzeProject });

        const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
            mainPackageJson: defaultMainPackageJson
        });
        const result = graph.flatten('/dir/entry.js');

        assert.deepStrictEqual(result.localFiles, [
            { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/entry.js', project: {} },
            { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/foo.js', project: {} },
            { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/bar.js', project: {} }
        ]);
    });

    test('returns the local dependency files found in subsequent dependencies', async function () {
        const getReferencedModules = stub()
            .onFirstCall()
            .returns([localCode('/dir/foo.js'), localCode('/dir/bar.js')])
            .onSecondCall()
            .returns([])
            .onThirdCall()
            .returns([localCode('/dir/baz.js')])
            .onCall(3)
            .returns([]);
        const dependencyScanner = dependencyScannerFactory({
            analyzeProject: createFakeAnalyzeProject({ getReferencedModules })
        });

        const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
            mainPackageJson: defaultMainPackageJson
        });
        const result = graph.flatten('/dir/entry.js');

        assert.strictEqual(getReferencedModules.callCount, 4);
        assert.deepStrictEqual(getReferencedModules.firstCall.args, ['/dir/entry.js']);
        assert.deepStrictEqual(getReferencedModules.secondCall.args, ['/dir/foo.js']);
        assert.deepStrictEqual(getReferencedModules.thirdCall.args, ['/dir/bar.js']);
        assert.deepStrictEqual(getReferencedModules.getCall(3).args, ['/dir/baz.js']);
        assert.deepStrictEqual(result.localFiles, [
            { directDependencies: new Set(['/dir/foo.js', '/dir/bar.js']), filePath: '/dir/entry.js', project: {} },
            { directDependencies: new Set(), filePath: '/dir/foo.js', project: {} },
            { directDependencies: new Set(['/dir/baz.js']), filePath: '/dir/bar.js', project: {} },
            { directDependencies: new Set(), filePath: '/dir/baz.js', project: {} }
        ]);
    });

    async function scanWithReferencedModules(referencedModules: readonly ModuleReference[]): Promise<DependencyFiles> {
        const getReferencedModules = fake.returns(referencedModules);
        const analyzeProject = createFakeAnalyzeProject({ getReferencedModules });
        const dependencyScanner = dependencyScannerFactory({ analyzeProject });

        const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
            mainPackageJson: defaultMainPackageJson
        });
        return graph.flatten('/dir/entry.js');
    }

    async function scanWithReferencedModuleStub(getReferencedModules: SinonSpy): Promise<DependencyFiles> {
        const dependencyScanner = dependencyScannerFactory({
            analyzeProject: createFakeAnalyzeProject({ getReferencedModules })
        });

        const graph = await dependencyScanner.scan('/dir/entry.js', '/dir', {
            mainPackageJson: defaultMainPackageJson
        });

        return graph.flatten('/dir/entry.js');
    }

    async function expectExternalDependencies(
        referencedModules: readonly ModuleReference[],
        expectedDependencies: ReadonlyMap<string, { readonly name: string; readonly referencedFrom: readonly string[] }>
    ): Promise<void> {
        const result = await scanWithReferencedModules(referencedModules);

        assert.deepStrictEqual(result.externalDependencies, expectedDependencies);
    }

    test('doesn’t include any package imports in localFiles', async function () {
        const result = await scanWithReferencedModules([localCode('/dir/foo.js'), externalPackage('any-module')]);

        assert.deepStrictEqual(result.localFiles, [
            { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/entry.js', project: {} },
            { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/foo.js', project: {} }
        ]);
    });

    test('returns all detected package dependencies', async function () {
        await expectExternalDependencies(
            [externalPackage('any-module')],
            new Map([['any-module', { name: 'any-module', referencedFrom: ['/dir/entry.js'] }]])
        );
    });

    test('returns the scoped package name for scoped package dependencies', async function () {
        await expectExternalDependencies(
            [externalPackage('@scope/any-module')],
            new Map([['@scope/any-module', { name: '@scope/any-module', referencedFrom: ['/dir/entry.js'] }]])
        );
    });

    test('returns only package dependencies from mixed local and package references', async function () {
        const getReferencedModules = stub()
            .onFirstCall()
            .returns([
                localCode('/dir/foo.js'),
                localAsset('/dir/data.json'),
                generatedManifest('/dir/package.json'),
                externalPackage('any-module')
            ])
            .onSecondCall()
            .returns([]);
        const result = await scanWithReferencedModuleStub(getReferencedModules);

        assert.deepStrictEqual(
            result.externalDependencies,
            new Map([['any-module', { name: 'any-module', referencedFrom: ['/dir/entry.js'] }]])
        );
    });

    test('doesn’t include the same local dependency twice', async function () {
        const result = await scanWithReferencedModules([localCode('/dir/foo.js'), localCode('/dir/foo.js')]);

        assert.deepStrictEqual(result.localFiles, [
            { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/entry.js', project: {} },
            { directDependencies: new Set(['/dir/foo.js']), filePath: '/dir/foo.js', project: {} }
        ]);
    });

    test('returns local asset files without a project', async function () {
        const result = await scanWithReferencedModules([localAsset('/dir/data.json')]);

        assert.deepStrictEqual(result.localFiles, [
            { directDependencies: new Set(['/dir/data.json']), filePath: '/dir/entry.js', project: {} },
            { directDependencies: new Set(), filePath: '/dir/data.json', project: undefined }
        ]);
    });

    test('returns generated manifest files with the generated-manifest marker', async function () {
        const result = await scanWithReferencedModules([generatedManifest('/dir/package.json')]);

        assert.deepStrictEqual(result.localFiles, [
            { directDependencies: new Set(['/dir/package.json']), filePath: '/dir/entry.js', project: {} },
            {
                directDependencies: new Set(),
                filePath: '/dir/package.json',
                isGeneratedManifest: true,
                project: undefined
            }
        ]);
    });

    test('doesn’t scan nested references for assets or generated manifests', async function () {
        const getReferencedModules = stub()
            .onFirstCall()
            .returns([localAsset('/dir/data.json'), generatedManifest('/dir/package.json')]);
        const result = await scanWithReferencedModuleStub(getReferencedModules);

        assert.strictEqual(getReferencedModules.callCount, 1);
        assert.deepStrictEqual(result.localFiles, [
            {
                directDependencies: new Set(['/dir/data.json', '/dir/package.json']),
                filePath: '/dir/entry.js',
                project: {}
            },
            { directDependencies: new Set(), filePath: '/dir/data.json', project: undefined },
            {
                directDependencies: new Set(),
                filePath: '/dir/package.json',
                isGeneratedManifest: true,
                project: undefined
            }
        ]);
    });
});
