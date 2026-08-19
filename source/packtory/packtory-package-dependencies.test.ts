import assert from 'node:assert';
import { suite, test } from 'mocha';
import { validateConfigWithoutRegistry, type ValidConfigWithoutRegistryResult } from '../config/validation.ts';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { PackageProcessor } from './package-processor.ts';
import { createScheduler } from './scheduler.ts';
import { createInspectPackageDependenciesValidated } from './packtory-package-dependencies.ts';

type DeadCodeEliminatorInput = {
    readonly bundle: LinkedBundle;
};

function dependency(
    name: string,
    sourceFilePath: string,
    sourceSpecifier = name,
    emittedSpecifier = sourceSpecifier
): ExternalDependency {
    return {
        name,
        referencedFrom: [ sourceFilePath ],
        references: [ { sourceFilePath, sourceSpecifier, emittedSpecifier } ]
    };
}

function legacyDependency(name: string, sourceFilePath: string): ExternalDependency {
    return { name, referencedFrom: [ sourceFilePath ] };
}

function orderedDependency(): ExternalDependency {
    return {
        name: 'ordered',
        referencedFrom: [ '/repo/pkg-a/z.js', '/repo/pkg-a/a.js' ],
        references: [
            { sourceFilePath: '/repo/pkg-a/z.js', sourceSpecifier: 'ordered/z', emittedSpecifier: 'ordered/z' },
            { sourceFilePath: '/repo/pkg-a/z.js', sourceSpecifier: 'ordered/a', emittedSpecifier: 'ordered/0' },
            { sourceFilePath: '/repo/pkg-a/z.js', sourceSpecifier: 'ordered/0', emittedSpecifier: 'ordered/0' },
            { sourceFilePath: '/repo/pkg-a/a.js', sourceSpecifier: 'ordered/b', emittedSpecifier: 'ordered/z' },
            { sourceFilePath: '/repo/pkg-a/a.js', sourceSpecifier: 'ordered/a', emittedSpecifier: 'ordered/z' },
            { sourceFilePath: '/repo/pkg-a/a.js', sourceSpecifier: 'ordered/a', emittedSpecifier: 'ordered/a' }
        ]
    };
}

function linkedBundle(name: string): LinkedBundle {
    return {
        name,
        contents: [],
        roots: {
            main: {
                js: {
                    content: '',
                    isExecutable: false,
                    sourceFilePath: `/repo/${name}/index.js`,
                    targetFilePath: 'index.js'
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        linkedBundleDependencies: name === 'pkg-a'
            ? new Map([
                [ 'pkg-b', dependency('pkg-b', '/repo/pkg-a/index.js', './pkg-b.js', 'pkg-b') ],
                [ 'pkg-c', dependency('pkg-c', '/repo/pkg-a/index.js', './pkg-c.js', 'pkg-c') ],
                [ 'shared', dependency('shared', '/repo/pkg-a/index.js', './shared.js', 'shared') ]
            ])
            : new Map(),
        substitutedSourceFilePathsByPackageName: new Map(),
        sourceMapTransformsByTargetPath: new Map(),
        externalDependencies: name === 'pkg-a'
            ? new Map([
                [ 'aliased', dependency('aliased', '/repo/pkg-a/index.js') ],
                [ 'ordered', orderedDependency() ],
                [ 'path-tiebreak', {
                    name: 'path-tiebreak',
                    referencedFrom: [ '/repo/pkg-a/z.js', '/repo/pkg-a/a.js' ],
                    references: [
                        { sourceFilePath: '/repo/pkg-a/z.js', sourceSpecifier: 'same', emittedSpecifier: 'a' },
                        { sourceFilePath: '/repo/pkg-a/a.js', sourceSpecifier: 'same', emittedSpecifier: 'z' }
                    ]
                } ],
                [ 'peer-lib', dependency('peer-lib', '/repo/pkg-a/index.js') ],
                [ 'react', dependency('react', '/repo/pkg-a/index.js', 'react/jsx-runtime') ],
                [ 'shared', legacyDependency('shared', '/repo/pkg-a/legacy.js') ],
                [ 'tarball', dependency('tarball', '/repo/pkg-a/index.js') ],
                [ 'missing', dependency('missing', '/repo/pkg-a/index.js') ]
            ])
            : new Map()
    };
}

async function unexpectedPackageProcessorCall(): Promise<never> {
    throw new Error('unexpected package processor call');
}

function packageProcessor(): PackageProcessor {
    return {
        async resolveAndLink(options) {
            return linkedBundle(options.name);
        },
        async resolveAndLinkWithPromotedDeclarationCompanions(options) {
            return linkedBundle(options.name);
        },
        build: unexpectedPackageProcessorCall,
        buildAndPublish: unexpectedPackageProcessorCall,
        tryBuildAndPublish: unexpectedPackageProcessorCall
    };
}

function failingPackageProcessor(failure: Error): PackageProcessor {
    return {
        async resolveAndLink() {
            throw failure;
        },
        async resolveAndLinkWithPromotedDeclarationCompanions() {
            throw failure;
        },
        build: unexpectedPackageProcessorCall,
        buildAndPublish: unexpectedPackageProcessorCall,
        tryBuildAndPublish: unexpectedPackageProcessorCall
    };
}

const deadCodeEliminator = {
    async eliminate(inputs: readonly DeadCodeEliminatorInput[]) {
        return inputs.map(function (input) {
            return { ...input.bundle, sideEffectsField: undefined, contents: [] };
        });
    }
};

function validatedConfig(): ValidConfigWithoutRegistryResult {
    const validation = validateConfigWithoutRegistry({
        commonPackageSettings: {
            sourcesFolder: '/repo',
            mainPackageJson: {
                type: 'module',
                dependencies: {
                    aliased: 'npm:other-pkg@git+https://github.com/foo/bar#main',
                    ordered: '^2.0.0',
                    'path-tiebreak': '^4.0.0',
                    shared: '^3.0.0',
                    tarball: 'https://example.test/tarball.tgz',
                    react: 'workspace:*'
                },
                peerDependencies: { 'peer-lib': '^1.0.0' }
            },
            publishSettings: { access: 'public' }
        },
        packages: [
            { name: 'pkg-b', roots: { main: { js: 'pkg-b/index.js' } } },
            { name: 'pkg-c', roots: { main: { js: 'pkg-c/index.js' } } },
            {
                name: 'pkg-a',
                roots: { main: { js: 'pkg-a/index.js' } },
                bundleDependencies: [ 'pkg-c' ],
                bundlePeerDependencies: [ 'pkg-b' ]
            }
        ]
    });
    if (validation.isErr) {
        throw new Error(validation.error.join('\n'));
    }
    return validation.value;
}

function validatedConfigWithoutManifestDependencies(): ValidConfigWithoutRegistryResult {
    const validation = validateConfigWithoutRegistry({
        commonPackageSettings: {
            sourcesFolder: '/repo',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: [
            { name: 'pkg-b', roots: { main: { js: 'pkg-b/index.js' } } },
            { name: 'pkg-c', roots: { main: { js: 'pkg-c/index.js' } } },
            { name: 'pkg-a', roots: { main: { js: 'pkg-a/index.js' } } }
        ]
    });
    if (validation.isErr) {
        throw new Error(validation.error.join('\n'));
    }
    return validation.value;
}

suite('packtory-package-dependencies', function () {
    test('inspectPackageDependencies reports final external and bundle dependency reasons', async function () {
        const broadcaster = createProgressBroadcaster();
        const inspectPackageDependencies = createInspectPackageDependenciesValidated({
            repositoryFolder: '/repo',
            progressBroadcaster: broadcaster,
            scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider }),
            packageProcessor: packageProcessor(),
            deadCodeEliminator
        });

        const result = await inspectPackageDependencies(validatedConfig(), 'pkg-a');

        if (result.isErr) {
            assert.fail('expected dependency inspection to succeed');
        }
        assert.deepStrictEqual(result.value.dependencies, [
            {
                name: 'aliased',
                origin: 'external',
                manifest: {
                    type: 'invalid-version',
                    group: 'dependencies',
                    version: 'npm:other-pkg@git+https://github.com/foo/bar#main',
                    message: 'Error: aliases only work for registry deps'
                },
                references: [
                    { sourcePath: 'pkg-a/index.js', sourceSpecifier: 'aliased', emittedSpecifier: 'aliased' }
                ]
            },
            {
                name: 'missing',
                origin: 'external',
                manifest: { type: 'missing-version' },
                references: [
                    { sourcePath: 'pkg-a/index.js', sourceSpecifier: 'missing', emittedSpecifier: 'missing' }
                ]
            },
            {
                name: 'ordered',
                origin: 'external',
                manifest: { type: 'emitted', group: 'dependencies', version: '^2.0.0' },
                references: [
                    { sourcePath: 'pkg-a/a.js', sourceSpecifier: 'ordered/a', emittedSpecifier: 'ordered/a' },
                    { sourcePath: 'pkg-a/a.js', sourceSpecifier: 'ordered/a', emittedSpecifier: 'ordered/z' },
                    { sourcePath: 'pkg-a/a.js', sourceSpecifier: 'ordered/b', emittedSpecifier: 'ordered/z' },
                    { sourcePath: 'pkg-a/z.js', sourceSpecifier: 'ordered/0', emittedSpecifier: 'ordered/0' },
                    { sourcePath: 'pkg-a/z.js', sourceSpecifier: 'ordered/a', emittedSpecifier: 'ordered/0' },
                    { sourcePath: 'pkg-a/z.js', sourceSpecifier: 'ordered/z', emittedSpecifier: 'ordered/z' }
                ]
            },
            {
                name: 'path-tiebreak',
                origin: 'external',
                manifest: { type: 'emitted', group: 'dependencies', version: '^4.0.0' },
                references: [
                    { sourcePath: 'pkg-a/a.js', sourceSpecifier: 'same', emittedSpecifier: 'z' },
                    { sourcePath: 'pkg-a/z.js', sourceSpecifier: 'same', emittedSpecifier: 'a' }
                ]
            },
            {
                name: 'peer-lib',
                origin: 'external',
                manifest: { type: 'emitted', group: 'peerDependencies', version: '^1.0.0' },
                references: [
                    { sourcePath: 'pkg-a/index.js', sourceSpecifier: 'peer-lib', emittedSpecifier: 'peer-lib' }
                ]
            },
            {
                name: 'pkg-b',
                origin: 'bundle-peer',
                manifest: { type: 'emitted', group: 'peerDependencies', version: '0.0.0' },
                references: [
                    { sourcePath: 'pkg-a/index.js', sourceSpecifier: './pkg-b.js', emittedSpecifier: 'pkg-b' }
                ]
            },
            {
                name: 'pkg-c',
                origin: 'bundle',
                manifest: { type: 'emitted', group: 'dependencies', version: '0.0.0' },
                references: [
                    { sourcePath: 'pkg-a/index.js', sourceSpecifier: './pkg-c.js', emittedSpecifier: 'pkg-c' }
                ]
            },
            {
                name: 'react',
                origin: 'external',
                manifest: {
                    type: 'invalid-version',
                    group: 'dependencies',
                    version: 'workspace:*',
                    message:
                        'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace,' +
                        ' not valid in a published manifest'
                },
                references: [
                    {
                        sourcePath: 'pkg-a/index.js',
                        sourceSpecifier: 'react/jsx-runtime',
                        emittedSpecifier: 'react/jsx-runtime'
                    }
                ]
            },
            {
                name: 'shared',
                origin: 'bundle',
                manifest: { type: 'emitted', group: 'dependencies', version: '0.0.0' },
                references: [
                    { sourcePath: 'pkg-a/index.js', sourceSpecifier: './shared.js', emittedSpecifier: 'shared' }
                ]
            },
            {
                name: 'shared',
                origin: 'external',
                manifest: { type: 'emitted', group: 'dependencies', version: '^3.0.0' },
                references: [
                    { sourcePath: 'pkg-a/legacy.js', sourceSpecifier: 'shared', emittedSpecifier: 'shared' }
                ]
            },
            {
                name: 'tarball',
                origin: 'external',
                manifest: {
                    type: 'invalid-version',
                    group: 'dependencies',
                    version: 'https://example.test/tarball.tgz',
                    message: 'Mutable remote dependency specifier is not allowed'
                },
                references: [
                    { sourcePath: 'pkg-a/index.js', sourceSpecifier: 'tarball', emittedSpecifier: 'tarball' }
                ]
            }
        ]);
    });

    test('inspectPackageDependencies reports partial failures', async function () {
        const broadcaster = createProgressBroadcaster();
        const failure = new Error('resolve failed');
        const partialInspector = createInspectPackageDependenciesValidated({
            repositoryFolder: '/repo',
            progressBroadcaster: broadcaster,
            scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider }),
            packageProcessor: failingPackageProcessor(failure),
            deadCodeEliminator
        });

        const partialResult = await partialInspector(validatedConfig(), 'pkg-a');

        if (partialResult.isOk) {
            assert.fail('expected dependency inspection to fail');
        }
        assert.deepStrictEqual(partialResult.error, {
            type: 'partial',
            error: { succeeded: [], failures: [ failure, failure ] }
        });
    });

    test('inspectPackageDependencies reports package-not-found failures', async function () {
        const broadcaster = createProgressBroadcaster();
        const notFoundInspector = createInspectPackageDependenciesValidated({
            repositoryFolder: '/repo',
            progressBroadcaster: broadcaster,
            scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider }),
            packageProcessor: packageProcessor(),
            deadCodeEliminator
        });

        const missingResult = await notFoundInspector(validatedConfig(), 'missing');

        if (missingResult.isOk) {
            assert.fail('expected dependency inspection to fail');
        }
        assert.deepStrictEqual(missingResult.error, { type: 'package-not-found', packageName: 'missing' });
    });

    test('inspectPackageDependencies handles manifests without dependency fields', async function () {
        const broadcaster = createProgressBroadcaster();
        const inspectPackageDependencies = createInspectPackageDependenciesValidated({
            repositoryFolder: '/repo',
            progressBroadcaster: broadcaster,
            scheduler: createScheduler({ progressBroadcastProvider: broadcaster.provider }),
            packageProcessor: packageProcessor(),
            deadCodeEliminator
        });

        const result = await inspectPackageDependencies(validatedConfigWithoutManifestDependencies(), 'pkg-a');

        if (result.isErr) {
            assert.fail('expected dependency inspection to succeed');
        }
        assert.strictEqual(result.value.dependencies[0]?.manifest.type, 'missing-version');
    });
});
