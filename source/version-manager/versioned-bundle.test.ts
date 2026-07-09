import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    analyzedBundle as createAnalyzedBundle,
    analyzedBundleResource,
    externalDependency as createReferencedDependency,
    standardVersionedBundle,
    versionedBundle
} from '../test-libraries/bundle-fixtures.ts';
import type { PackageInterface } from '../config/package-interface.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import {
    buildVersionedBundle,
    type BuildVersionedBundleOptions,
    type VersionedBundle
} from './versioned-bundle.ts';

type BuildOverrides = Partial<BuildVersionedBundleOptions> & {
    readonly mainPackageJson?: MainPackageJson;
};

function buildOptions(overrides: BuildOverrides = {}): BuildVersionedBundleOptions {
    return {
        bundle: createAnalyzedBundle(),
        version: '1.2.3',
        mainPackageJson: { type: 'module' },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
        allowMutableSpecifiers: [],
        ...overrides
    };
}

function explicitCliBundle(packageInterface: PackageInterface): AnalyzedBundle {
    return createAnalyzedBundle({
        roots: {
            cli: {
                js: {
                    sourceFilePath: '/src/cli.js',
                    targetFilePath: 'cli.js',
                    content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                    isExecutable: true
                }
            }
        },
        surface: {
            mode: 'explicit',
            packageInterface
        }
    });
}

function assertCliMainFile(result: VersionedBundle): void {
    assert.deepStrictEqual(result.mainFile, {
        sourceFilePath: '/src/cli.js',
        targetFilePath: 'cli.js',
        content: '#!/usr/bin/env node\nconsole.log("cli");\n',
        isExecutable: true
    });
}

suite('versioned-bundle', function () {
    test('buildVersionedBundle() uses the representative root as the main and types files', function () {
        const result = buildVersionedBundle(buildOptions({ additionalPackageJsonAttributes: { custom: true } }));

        assert.deepStrictEqual(result, standardVersionedBundle({ additionalAttributes: { custom: true } }));
    });

    test('buildVersionedBundle() groups bundle dependencies and peer dependencies by package name', function () {
        const result = buildVersionedBundle(
            buildOptions({
                bundle: createAnalyzedBundle({
                    linkedBundleDependencies: new Map([
                        [ 'bundle-dependency', createReferencedDependency('bundle-dependency') ],
                        [ 'peer-dependency', createReferencedDependency('peer-dependency') ]
                    ])
                }),
                bundleDependencies: [
                    versionedBundle({
                        name: 'bundle-dependency',
                        version: '2.0.0',
                        mainFile: { sourceFilePath: '/src/dep.js', targetFilePath: 'dep.js' }
                    })
                ],
                bundlePeerDependencies: [
                    versionedBundle({
                        name: 'peer-dependency',
                        version: '3.0.0',
                        mainFile: { sourceFilePath: '/src/peer.js', targetFilePath: 'peer.js' }
                    })
                ]
            })
        );

        assert.partialDeepStrictEqual(result, {
            dependencies: { 'bundle-dependency': '2.0.0' },
            peerDependencies: { 'peer-dependency': '3.0.0' }
        });
    });

    test('buildVersionedBundle() omits the importsField when no #imports survive', function () {
        const result = buildVersionedBundle(buildOptions());

        assert.strictEqual(result.importsField, undefined);
    });

    test('buildVersionedBundle() exposes the bin field and omits typesMainFile for an explicit bin-only surface', function () {
        const result = buildVersionedBundle(
            buildOptions({
                bundle: explicitCliBundle({ bins: [ { root: 'cli', name: 'package-a' } ] })
            })
        );

        assertCliMainFile(result);
        assert.deepStrictEqual(result.binField, { 'package-a': './cli.js' });
        assert.strictEqual(Object.hasOwn(result, 'binField'), true);
        assert.strictEqual(Object.hasOwn(result, 'typesMainFile'), false);
    });

    test('buildVersionedBundle() throws when an implicit surface references an unknown defaultModuleRoot', function () {
        assert.throws(function () {
            buildVersionedBundle(
                buildOptions({
                    bundle: createAnalyzedBundle({
                        roots: {},
                        surface: { mode: 'implicit', defaultModuleRoot: 'missing' }
                    })
                })
            );
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });

    test('buildVersionedBundle() throws when an explicit module entry references an unknown root', function () {
        assert.throws(function () {
            buildVersionedBundle(
                buildOptions({
                    bundle: createAnalyzedBundle({
                        roots: {},
                        surface: {
                            mode: 'explicit',
                            packageInterface: { modules: [ { root: 'missing', export: '.' } ] }
                        }
                    })
                })
            );
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });

    test('buildVersionedBundle() exposes the imports field for surviving #imports specifiers', function () {
        const result = buildVersionedBundle(
            buildOptions({
                bundle: createAnalyzedBundle({
                    contents: [
                        analyzedBundleResource('/src/index.js', {
                            content: 'export { foo } from "#foo";\n'
                        })
                    ]
                }),
                mainPackageJson: { type: 'module', imports: { '#foo': './src/foo.js' } }
            })
        );

        assert.deepStrictEqual(result.importsField, { '#foo': './src/foo.js' });
    });
});
