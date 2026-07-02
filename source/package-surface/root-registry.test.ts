import assert from 'node:assert';
import { suite, test } from 'mocha';
import { plainRoot, rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import { getEntryRootIds, getRoot } from './root-registry.ts';

suite('root-registry', function () {
    test('getRoot returns the root for a known id', function () {
        const root = rootWithSource('/src/index.js', 'index.js');

        assert.strictEqual(getRoot({ name: 'package-a', roots: { main: root } }, 'main'), root);
    });

    test('getRoot throws when the id is not present', function () {
        assert.throws(function () {
            getRoot({ name: 'package-a', roots: { main: rootWithSource('/src/index.js', 'index.js') } }, 'missing');
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });

    test('getEntryRootIds returns every root id in implicit mode', function () {
        const result = getEntryRootIds({
            roots: { main: plainRoot('index.js'), worker: plainRoot('worker.js') },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        });

        assert.deepStrictEqual(result, new Set([ 'main', 'worker' ]));
    });

    test('getEntryRootIds includes explicit module roots', function () {
        const result = getEntryRootIds({
            roots: { main: plainRoot('index.js') },
            surface: { mode: 'explicit', packageInterface: { modules: [ { root: 'main', export: '.' } ] } }
        });

        assert.deepStrictEqual(result, new Set([ 'main' ]));
    });

    test('getEntryRootIds includes explicit bin roots', function () {
        const result = getEntryRootIds({
            roots: { cli: plainRoot('cli.js') },
            surface: { mode: 'explicit', packageInterface: { bins: [ { root: 'cli', name: 'package-a' } ] } }
        });

        assert.deepStrictEqual(result, new Set([ 'cli' ]));
    });

    test('getEntryRootIds includes explicit privateRoots alongside public roots', function () {
        const result = getEntryRootIds({
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

    test('getEntryRootIds dedupes a root referenced by both modules and bins', function () {
        const result = getEntryRootIds({
            roots: { shared: plainRoot('shared.js') },
            surface: {
                mode: 'explicit',
                packageInterface: {
                    modules: [ { root: 'shared', export: '.' } ],
                    bins: [ { root: 'shared', name: 'package-a' } ]
                }
            }
        });

        assert.deepStrictEqual(result, new Set([ 'shared' ]));
    });
});
