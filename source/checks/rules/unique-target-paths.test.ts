import assert from 'node:assert';
import { suite, test } from 'mocha';
import { emptyCheckContext } from '../../test-libraries/check-fixtures.ts';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { uniqueTargetPathsRule } from './unique-target-paths.ts';

function bundleWithMappings(name: string, mappings: readonly (readonly [string, string])[]): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: mappings.map(function ([ inputFilePath, targetFilePath ]) {
            return analyzedBundleResource(inputFilePath, { targetFilePath });
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
                    [ '/source/a.js', 'collide.js' ],
                    [ '/source/b.js', 'collide.js' ]
                ])
            ],
            settings: undefined,
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when the rule is disabled', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/source/a.js', 'collide.js' ],
                    [ '/source/b.js', 'collide.js' ]
                ])
            ],
            settings: { uniqueTargetPaths: { enabled: false } },
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(result, []);
    });

    test('returns no issues when every targetFilePath is unique', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/source/a.js', 'a.js' ],
                    [ '/source/b.js', 'b.js' ]
                ])
            ],
            settings: enabled,
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(result, []);
    });

    test('reports a collision and lists the colliding source paths sorted', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/source/b.js', 'collide.js' ],
                    [ '/source/a.js', 'collide.js' ]
                ])
            ],
            settings: enabled,
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(result, [
            'Package "a" maps multiple sources to "collide.js": /source/a.js, /source/b.js'
        ]);
    });

    test('reports collisions independently per bundle', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/a-source/x.js', 'shared.js' ],
                    [ '/a-source/y.js', 'shared.js' ]
                ]),
                bundleWithMappings('b', [
                    [ '/b-source/p.js', 'p.js' ],
                    [ '/b-source/q.js', 'q.js' ]
                ])
            ],
            settings: enabled,
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(result, [
            'Package "a" maps multiple sources to "shared.js": /a-source/x.js, /a-source/y.js'
        ]);
    });

    test('reports each colliding target path of a bundle', async function () {
        const result = await uniqueTargetPathsRule.run({
            bundles: [
                bundleWithMappings('a', [
                    [ '/source/x1.js', 'one.js' ],
                    [ '/source/x2.js', 'one.js' ],
                    [ '/source/y1.js', 'two.js' ],
                    [ '/source/y2.js', 'two.js' ]
                ])
            ],
            settings: enabled,
            ...emptyCheckContext()
        });

        assert.deepStrictEqual(result, [
            'Package "a" maps multiple sources to "one.js": /source/x1.js, /source/x2.js',
            'Package "a" maps multiple sources to "two.js": /source/y1.js, /source/y2.js'
        ]);
    });
});
