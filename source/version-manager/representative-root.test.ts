import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageInterface } from '../configuration/package-interface.ts';
import type { RootFileDescription } from '../resource-resolver/resolved-bundle.ts';
import { resolveRepresentativeRoot } from './representative-root.ts';

const indexRoot: RootFileDescription = {
    javaScript: { inputFilePath: '/source/index.js', targetFilePath: 'index.js', content: '', isExecutable: false }
};

const featureRoot: RootFileDescription = {
    javaScript: { inputFilePath: '/source/feature.js', targetFilePath: 'feature.js', content: '', isExecutable: false },
    declarationFile: {
        inputFilePath: '/source/feature.d.ts',
        targetFilePath: 'feature.d.ts',
        content: '',
        isExecutable: false
    }
};

const commandLineInterfaceRoot: RootFileDescription = {
    javaScript: {
        inputFilePath: '/source/cli.js',
        targetFilePath: 'cli.js',
        content: '#!/usr/bin/env node',
        isExecutable: true
    }
};

suite('representative-root', function () {
    test('resolveRepresentativeRoot returns the implicit defaultModuleRoot for an implicit surface', function () {
        assert.deepStrictEqual(
            resolveRepresentativeRoot({
                name: 'package-a',
                roots: { main: indexRoot },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' }
            }),
            indexRoot
        );
    });

    test('resolveRepresentativeRoot returns the first explicit module root', function () {
        assert.deepStrictEqual(
            resolveRepresentativeRoot({
                name: 'package-a',
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
                name: 'package-a',
                roots: { commandLineInterface: commandLineInterfaceRoot },
                surface: {
                    mode: 'explicit',
                    packageInterface: { executables: [ { root: 'commandLineInterface', name: 'package-a' } ] }
                }
            }),
            commandLineInterfaceRoot
        );
    });

    test('resolveRepresentativeRoot falls back to executables when the modules array is empty', function () {
        const packageInterface = {
            modules: [],
            executables: [ { root: 'commandLineInterface', name: 'package-a' } ]
        } as unknown as PackageInterface;
        assert.deepStrictEqual(
            resolveRepresentativeRoot({
                name: 'package-a',
                roots: { commandLineInterface: commandLineInterfaceRoot },
                surface: { mode: 'explicit', packageInterface }
            }),
            commandLineInterfaceRoot
        );
    });

    test('resolveRepresentativeRoot throws when an explicit surface declares neither modules nor executables', function () {
        try {
            resolveRepresentativeRoot({
                name: 'package-a',
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
                'Package "package-a" explicit surface declares neither modules nor executables'
            );
        }
    });

    test('resolveRepresentativeRoot throws when the selected representative root is missing', function () {
        assert.throws(function () {
            resolveRepresentativeRoot({
                name: 'package-a',
                roots: {},
                surface: {
                    mode: 'explicit',
                    packageInterface: { modules: [ { root: 'missing', export: '.' } ] }
                }
            });
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });
});
