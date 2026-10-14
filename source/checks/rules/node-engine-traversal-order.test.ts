import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundle, externalDependency } from '../../test-libraries/bundle-fixtures.ts';
import {
    engineCheckInput,
    engineFileManager,
    enginePublishedPackage
} from '../../test-libraries/node-engine-fixtures.ts';
import { createNodeEngineCompatibilityRule } from './node-engine-compatibility.ts';

suite('Node engine traversal diagnostics', function () {
    test('checks distinct generated siblings independently', async function () {
        const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, Array.of<string>()) });
        const fields = { engines: { node: '>=22' }, dependencies: { first: '*', second: '*' } };
        const issues = await rule.run({
            ...engineCheckInput(fields),
            bundles: [
                analyzedBundle({
                    name: 'root',
                    linkedBundleDependencies: new Map([
                        [ 'first', externalDependency('first', [ 'index.js' ]) ],
                        [ 'second', externalDependency('second', [ 'index.js' ]) ]
                    ])
                }),
                analyzedBundle({ name: 'first' }),
                analyzedBundle({ name: 'second' })
            ],
            sourceFolders: new Map([ [ 'root', '/repo/src' ], [ 'first', '/first' ], [ 'second', '/second' ] ]),
            publishedPackages: new Map([
                [ 'root', enginePublishedPackage('root', fields) ],
                [ 'first', enginePublishedPackage('first', {}) ],
                [ 'second', enginePublishedPackage('second', { engines: { node: '>=24' } }) ]
            ])
        });
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> second@1.0.0: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
    });

    test('reads generated roots in package-name order regardless of bundle order', async function () {
        const reads: string[] = [];
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/a/node_modules/direct': { engines: { node: '>=24' } },
                    '/b/node_modules/direct': { engines: { node: '>=24' } }
                },
                {},
                reads
            )
        });
        const fields = { engines: { node: '>=22' }, dependencies: { direct: '*' } };
        const issues = await rule.run({
            ...engineCheckInput({}),
            bundles: [ analyzedBundle({ name: 'b' }), analyzedBundle({ name: 'a' }) ],
            sourceFolders: new Map([ [ 'a', '/a/src' ], [ 'b', '/b/src' ] ]),
            publishedPackages: new Map([
                [ 'a', enginePublishedPackage('a', fields) ],
                [ 'b', enginePublishedPackage('b', fields) ]
            ])
        });
        assert.strictEqual(issues.length, 2);
        assert.deepStrictEqual(reads, [ '/a/node_modules/direct/package.json', '/b/node_modules/direct/package.json' ]);
    });

    test('sorts issue chains independently of breadth-first discovery order', async function () {
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/repo/node_modules/a': { dependencies: { leaf: '*' } },
                    '/repo/node_modules/b': { engines: { node: '>=24' } },
                    '/repo/node_modules/leaf': { engines: { node: '>=24' } }
                },
                {},
                Array.of<string>()
            )
        });
        const issues = await rule.run(
            engineCheckInput({ engines: { node: '>=22' }, dependencies: { b: '*', a: '*' } })
        );
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> a -> leaf: ' +
            'engines.node ">=22" is not a subset of ">=24"',
            'Package "root" failed Node engine compatibility via root -> b: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
    });

    test('rejects a generated sibling manifest that has no corresponding analyzed bundle', async function () {
        const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, Array.of<string>()) });
        const fields = { engines: { node: '>=22' }, dependencies: { sibling: '*' } };
        const issues = await rule.run({
            ...engineCheckInput(fields),
            bundles: [ analyzedBundle({
                name: 'root',
                linkedBundleDependencies: new Map([
                    [ 'sibling', externalDependency('sibling', [ 'index.js' ]) ]
                ])
            }) ],
            publishedPackages: new Map([
                [ 'root', enginePublishedPackage('root', fields) ],
                [ 'sibling', enginePublishedPackage('sibling', {}) ]
            ])
        });
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> sibling: ' +
            'Error: Generated package missing for "sibling"'
        ]);
    });

    test('diagnoses invalid dependency names before attempting to resolve package paths', async function () {
        const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, Array.of<string>()) });
        const issues = await rule.run(engineCheckInput({ engines: { node: '>=22' }, dependencies: { 'dep@1': '*' } }));
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root: ' +
            'Error: Invalid dependency name "dep@1"'
        ]);
    });
});
