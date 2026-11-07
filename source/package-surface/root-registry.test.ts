import assert from 'node:assert';
import { suite, test } from 'mocha';
import { plainRoot, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import { getEntryRootIdentifiers, getEntryRootTargetFilePaths, getRoot } from './root-registry.ts';

suite('root-registry', function () {
    test('entry paths include JSON and declaration-only roots', function () {
        assert.deepStrictEqual(
            getEntryRootTargetFilePaths({
                name: 'data',
                roots: {
                    data: {
                        json: {
                            inputFilePath: '/source/data.json',
                            targetFilePath: 'data.json',
                            content: '{}',
                            isExecutable: false
                        }
                    },
                    types: { declarationFile: { inputFilePath: '/source/index.d.ts', targetFilePath: 'index.d.ts' } }
                },
                surface: { mode: 'implicit', defaultModuleRoot: 'data' }
            }),
            [ 'data.json', 'index.d.ts' ]
        );
    });

    test('entry paths reject unknown roots referenced by an explicit surface', function () {
        assert.throws(function () {
            return getEntryRootTargetFilePaths({
                name: 'data',
                roots: {},
                surface: {
                    mode: 'explicit',
                    packageInterface: { modules: [ { root: 'missing', export: '.' } ] }
                }
            });
        }, { message: 'Bundle "data" is missing root "missing" referenced by its entry surface' });
    });

    test('file-only packages have no code entry roots', function () {
        assert.deepStrictEqual(getEntryRootIdentifiers({ roots: {}, surface: { mode: 'files' } }), new Set());
    });

    test('getRoot returns the root for a known id', function () {
        const root = rootWithSource('/source/index.js', 'index.js');

        assert.strictEqual(getRoot({ name: 'package-a', roots: { main: root } }, 'main'), root);
    });

    test('getRoot throws when the id is not present', function () {
        assert.throws(function () {
            getRoot({ name: 'package-a', roots: { main: rootWithSource('/source/index.js', 'index.js') } }, 'missing');
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });

    test('getEntryRootIdentifiers returns every root id in implicit mode', function () {
        const result = getEntryRootIdentifiers({
            roots: { main: plainRoot('index.js'), worker: plainRoot('worker.js') },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        });

        assert.deepStrictEqual(result, new Set([ 'main', 'worker' ]));
    });

    test('getEntryRootIdentifiers includes explicit module roots', function () {
        const result = getEntryRootIdentifiers({
            roots: { main: plainRoot('index.js') },
            surface: { mode: 'explicit', packageInterface: { modules: [ { root: 'main', export: '.' } ] } }
        });

        assert.deepStrictEqual(result, new Set([ 'main' ]));
    });

    test('getEntryRootIdentifiers includes explicit bin roots', function () {
        const result = getEntryRootIdentifiers({
            roots: { commandLineInterface: plainRoot('cli.js') },
            surface: {
                mode: 'explicit',
                packageInterface: { executables: [ { root: 'commandLineInterface', name: 'package-a' } ] }
            }
        });

        assert.deepStrictEqual(result, new Set([ 'commandLineInterface' ]));
    });

    test('getEntryRootIdentifiers includes explicit privateRoots alongside public roots', function () {
        const result = getEntryRootIdentifiers({
            roots: { main: plainRoot('index.js'), worker: plainRoot('worker.js') },
            surface: {
                mode: 'explicit',
                packageInterface: {
                    modules: [ { root: 'main', export: '.' } ],
                    privateRoots: [ 'worker' ]
                }
            }
        });

        assert.deepStrictEqual(result, new Set([ 'main', 'worker' ]));
    });

    test('getEntryRootIdentifiers dedupes a root referenced by both modules and executables', function () {
        const result = getEntryRootIdentifiers({
            roots: { shared: plainRoot('shared.js') },
            surface: {
                mode: 'explicit',
                packageInterface: {
                    modules: [ { root: 'shared', export: '.' } ],
                    executables: [ { root: 'shared', name: 'package-a' } ]
                }
            }
        });

        assert.deepStrictEqual(result, new Set([ 'shared' ]));
    });
});
