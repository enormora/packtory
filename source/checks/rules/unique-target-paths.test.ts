import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { uniqueTargetPathsRule } from './unique-target-paths.ts';

function bundleWithMappings(name: string, mappings: readonly (readonly [string, string])[]): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: mappings.map(function ([ sourceFilePath, targetFilePath ]) {
            return analyzedBundleResource(sourceFilePath, { targetFilePath });
        })
    });
}

const enabled = { uniqueTargetPaths: { enabled: true } };

suite('unique-target-paths', function () {
    test('rule definition exposes name, schemas and a run function', function () {
        assert.strictEqual(uniqueTargetPathsRule.name, 'uniqueTargetPaths');
        assert.strictEqual(typeof uniqueTargetPathsRule.run, 'function');
    });

    test('returns no issues when settings are missing', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/src/a.js', 'collide.js' ],
                    [ '/src/b.js', 'collide.js' ]
                ])
            ],
            settings: undefined,
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when the rule is disabled', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/src/a.js', 'collide.js' ],
                    [ '/src/b.js', 'collide.js' ]
                ])
            ],
            settings: { uniqueTargetPaths: { enabled: false } },
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when every targetFilePath is unique', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/src/a.js', 'a.js' ],
                    [ '/src/b.js', 'b.js' ]
                ])
            ],
            settings: enabled,
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, []);
    });

    test('reports a collision and lists the colliding source paths sorted', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/src/b.js', 'collide.js' ],
                    [ '/src/a.js', 'collide.js' ]
                ])
            ],
            settings: enabled,
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, [ 'Package "a" maps multiple sources to "collide.js": /src/a.js, /src/b.js' ]);
    });

    test('reports collisions independently per bundle', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/a-src/x.js', 'shared.js' ],
                    [ '/a-src/y.js', 'shared.js' ]
                ]),
                bundleWithMappings('b', [
                    [ '/b-src/p.js', 'p.js' ],
                    [ '/b-src/q.js', 'q.js' ]
                ])
            ],
            settings: enabled,
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, [
            'Package "a" maps multiple sources to "shared.js": /a-src/x.js, /a-src/y.js'
        ]);
    });

    test('reports each colliding target path of a bundle', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/src/x1.js', 'one.js' ],
                    [ '/src/x2.js', 'one.js' ],
                    [ '/src/y1.js', 'two.js' ],
                    [ '/src/y2.js', 'two.js' ]
                ])
            ],
            settings: enabled,
            perPackageSettings: new Map()
        });

        assert.deepStrictEqual(result, [
            'Package "a" maps multiple sources to "one.js": /src/x1.js, /src/x2.js',
            'Package "a" maps multiple sources to "two.js": /src/y1.js, /src/y2.js'
        ]);
    });
});
