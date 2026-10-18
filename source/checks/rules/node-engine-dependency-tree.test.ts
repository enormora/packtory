import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundle, analyzedBundleResource, externalDependency } from '../../test-libraries/bundle-fixtures.ts';
import {
    engineCheckInput,
    engineFileManager,
    enginePublishedPackage
} from '../../test-libraries/node-engine-fixtures.ts';
import { createNodeEngineCompatibilityRule } from './node-engine-compatibility.ts';

suite('node-engine dependency tree', function () {
    test('terminates cycles and reads shared installed manifests once per root', async function () {
        const reads: string[] = [];
        const resolutions: string[] = [];
        const fileManager = engineFileManager(
            {
                '/repo/node_modules/a': { dependencies: { b: '*', shared: '*' } },
                '/repo/node_modules/b': { dependencies: { a: '*', shared: '*' } },
                '/repo/node_modules/shared': { engines: { node: '>=24' } }
            },
            {},
            reads
        );
        const rule = createNodeEngineCompatibilityRule({
            fileManager: {
                ...fileManager,
                async getRealPath(folder) {
                    resolutions.push(folder);
                    if (resolutions.length > 5) {
                        throw new Error('Dependency cycle was traversed repeatedly');
                    }
                    return fileManager.getRealPath(folder);
                }
            }
        });
        const issues = await rule.run(engineCheckInput({ engines: { node: '>=22' }, dependencies: { a: '*' } }));
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> a -> shared: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
        assert.deepStrictEqual(reads, [
            '/repo/node_modules/a/package.json',
            '/repo/node_modules/b/package.json',
            '/repo/node_modules/shared/package.json'
        ]);
        assert.deepStrictEqual(resolutions, [
            '/repo/node_modules/a',
            '/repo/node_modules/b',
            '/repo/node_modules/shared',
            '/repo/node_modules/a',
            '/repo/node_modules/shared'
        ]);
    });

    test('checks different nested versions of the same dependency independently', async function () {
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/repo/node_modules/a': { dependencies: { shared: '*' } },
                    '/repo/node_modules/b': { dependencies: { shared: '*' } },
                    '/repo/node_modules/shared': { version: '1.0.0', engines: { node: '>=20' } },
                    '/repo/node_modules/b/node_modules/shared': { version: '2.0.0', engines: { node: '>=24' } }
                },
                {},
                Array.of<string>()
            )
        });
        const issues = await rule.run(
            engineCheckInput({ engines: { node: '>=22' }, dependencies: { a: '*', b: '*' } })
        );
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> b -> shared@2.0.0: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
    });

    test('resolves scoped dependencies and peers relative to symlink targets', async function () {
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/store/direct': { peerDependencies: { '@scope/peer': '*' } },
                    '/store/node_modules/@scope/peer': { engines: { node: '>=24' } },
                    '/repo/node_modules/@scope/peer': { engines: { node: '>=20' } }
                },
                { '/repo/node_modules/direct': '/store/direct' },
                Array.of<string>()
            )
        });
        const issues = await rule.run(engineCheckInput({ engines: { node: '>=22' }, dependencies: { direct: '*' } }));
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> direct -> @scope/peer: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
    });

    test('resolves retained external references from each originating source directory', async function () {
        const input = engineCheckInput({ engines: { node: '>=22' }, dependencies: { direct: '*' } });
        const reads: string[] = [];
        const bundle = analyzedBundle({
            name: 'root',
            contents: [
                analyzedBundleResource('/workspace/b/source/index.d.ts', { targetFilePath: 'b.d.ts' }),
                analyzedBundleResource('/workspace/a/source/index.js', { targetFilePath: 'a.js' }),
                analyzedBundleResource('/workspace/unrelated.js', { targetFilePath: 'unrelated.js' })
            ],
            externalDependencies: new Map([ [ 'direct', externalDependency('direct', [ 'a.js', 'b.d.ts' ]) ] ])
        });
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/workspace/a/node_modules/direct': { engines: { node: '>=20' } },
                    '/workspace/b/node_modules/direct': { engines: { node: '>=24' } }
                },
                {},
                reads
            )
        });
        const issues = await rule.run({ ...input, bundles: [ bundle ] });
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> direct: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
        assert.deepStrictEqual(reads, [
            '/workspace/a/node_modules/direct/package.json',
            '/workspace/b/node_modules/direct/package.json'
        ]);
    });

    test('checks generated sibling peers and their externals against the original root range', async function () {
        const input = engineCheckInput({ engines: { node: '>=22' }, peerDependencies: { sibling: '*' } });
        const root = analyzedBundle({
            name: 'root',
            linkedBundleDependencies: new Map([
                [ 'sibling', externalDependency('sibling', [ 'index.js' ]) ]
            ])
        });
        const sibling = analyzedBundle({ name: 'sibling' });
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/sibling/node_modules/leaf': { engines: { node: '>=24' } },
                    '/repo/node_modules/sibling': { engines: { node: '>=20' } }
                },
                {},
                Array.of<string>()
            )
        });
        const issues = await rule.run({
            ...input,
            bundles: [ root, sibling ],
            sourceFolders: new Map([ [ 'root', '/repo/source' ], [ 'sibling', '/sibling/source' ] ]),
            publishedPackages: new Map([
                [
                    'root',
                    enginePublishedPackage('root', { engines: { node: '>=22' }, peerDependencies: { sibling: '*' } })
                ],
                [ 'sibling', enginePublishedPackage('sibling', { dependencies: { leaf: '*' } }) ]
            ])
        });
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> sibling@1.0.0 -> leaf: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
    });

    test('does not replace external packages with same-name configured siblings', async function () {
        const input = engineCheckInput({ engines: { node: '>=22' }, dependencies: { sibling: '*' } });
        const rule = createNodeEngineCompatibilityRule({
            fileManager: engineFileManager(
                {
                    '/repo/node_modules/sibling': { engines: { node: '>=24' } }
                },
                {},
                Array.of<string>()
            )
        });
        const issues = await rule.run({
            ...input,
            bundles: [ ...input.bundles, analyzedBundle({ name: 'sibling' }) ],
            publishedPackages: new Map([
                [
                    'root',
                    enginePublishedPackage('root', { engines: { node: '>=22' }, dependencies: { sibling: '*' } })
                ],
                [ 'sibling', enginePublishedPackage('sibling', {}) ]
            ])
        });
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root -> sibling: ' +
            'engines.node ">=22" is not a subset of ">=24"'
        ]);
    });

    test('reports a missing sibling and continues checking other dependencies', async function () {
        const input = engineCheckInput({ engines: { node: '>=22' }, dependencies: { sibling: '*', missing: '*' } });
        const root = analyzedBundle({
            name: 'root',
            linkedBundleDependencies: new Map([
                [ 'sibling', externalDependency('sibling', [ 'index.js' ]) ]
            ])
        });
        const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, Array.of<string>()) });
        const issues = await rule.run({ ...input, bundles: [ root ] });
        assert.strictEqual(issues.length, 2);
        assert.ok(issues.some(function (issue) {
            return issue.includes('Published package missing for "sibling"');
        }));
        assert.ok(issues.some(function (issue) {
            return issue.includes('Required dependency "missing"');
        }));
    });

    test('reports missing source context instead of passing an incomplete check', async function () {
        const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, Array.of<string>()) });
        const issues = await rule.run({
            ...engineCheckInput({ engines: { node: '>=22' } }),
            sourceFolders: new Map()
        });
        assert.deepStrictEqual(issues, [
            'Package "root" failed Node engine compatibility via root: ' +
            'Error: Source folder missing for "root"'
        ]);
    });

    test('uses deterministic output regardless of input manifest ordering', async function () {
        const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, Array.of<string>()) });
        const first = await rule.run(engineCheckInput({ engines: { node: '>=22' }, dependencies: { b: '*', a: '*' } }));
        const second = await rule.run(
            engineCheckInput({ engines: { node: '>=22' }, dependencies: { a: '*', b: '*' } })
        );
        assert.deepStrictEqual(first, second);
        assert.strictEqual(first.length, 2);
    });
});
