import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageInterface } from '../config/package-interface.ts';
import type { RootFileDescription } from '../resource-resolver/resolved-bundle.ts';
import { resolveRepresentativeRoot } from './representative-root.ts';

const indexRoot: RootFileDescription = {
    js: { sourceFilePath: '/src/index.js', targetFilePath: 'index.js', content: '', isExecutable: false }
};

const featureRoot: RootFileDescription = {
    js: { sourceFilePath: '/src/feature.js', targetFilePath: 'feature.js', content: '', isExecutable: false },
    declarationFile: {
        sourceFilePath: '/src/feature.d.ts',
        targetFilePath: 'feature.d.ts',
        content: '',
        isExecutable: false
    }
};

const cliRoot: RootFileDescription = {
    js: {
        sourceFilePath: '/src/cli.js',
        targetFilePath: 'cli.js',
        content: '#!/usr/bin/env node',
        isExecutable: true
    }
};

suite('representative-root', function () {
    test('resolveRepresentativeRoot returns the implicit defaultModuleRoot for an implicit surface', function () {
        assert.deepStrictEqual(
            resolveRepresentativeRoot({
                name: 'pkg-a',
                roots: { main: indexRoot },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            }),
            indexRoot
        );
    });

    test('resolveRepresentativeRoot returns the first explicit module root', function () {
        assert.deepStrictEqual(
            resolveRepresentativeRoot({
                name: 'pkg-a',
                roots: { main: indexRoot, feature: featureRoot },
                surface: {
                    mode: 'explicit',
                    packageInterface: { modules: [ { root: 'feature', export: '.' } ] }
                }
            }),
            featureRoot
        );
    });

    test('resolveRepresentativeRoot falls back to the first explicit bin root when no modules are declared', function () {
        assert.deepStrictEqual(
            resolveRepresentativeRoot({
                name: 'pkg-a',
                roots: { cli: cliRoot },
                surface: {
                    mode: 'explicit',
                    packageInterface: { bins: [ { root: 'cli', name: 'pkg-a' } ] }
                }
            }),
            cliRoot
        );
    });

    test('resolveRepresentativeRoot falls back to bins when the modules array is empty', function () {
        const packageInterface = {
            modules: [],
            bins: [ { root: 'cli', name: 'pkg-a' } ]
        } as unknown as PackageInterface;
        assert.deepStrictEqual(
            resolveRepresentativeRoot({
                name: 'pkg-a',
                roots: { cli: cliRoot },
                surface: { mode: 'explicit', packageInterface }
            }),
            cliRoot
        );
    });

    test('resolveRepresentativeRoot throws when an explicit surface declares neither modules nor bins', function () {
        try {
            resolveRepresentativeRoot({
                name: 'pkg-a',
                roots: {},
                surface: {
                    mode: 'explicit',

                    packageInterface: {}
                }
            });
            assert.fail('Expected resolveRepresentativeRoot() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Package "pkg-a" explicit surface declares neither modules nor bins'
            );
        }
    });

    test('resolveRepresentativeRoot throws when the selected representative root is missing', function () {
        assert.throws(function () {
            resolveRepresentativeRoot({
                name: 'pkg-a',
                roots: {},
                surface: {
                    mode: 'explicit',
                    packageInterface: { modules: [ { root: 'missing', export: '.' } ] }
                }
            });
        }, /^Error: Package "pkg-a" references unknown root "missing"$/u);
    });
});
