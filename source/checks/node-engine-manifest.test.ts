import assert from 'node:assert';
import { suite, test } from 'mocha';
import { readNodeEngineManifest, supportsNodeRange, validateNodeRange } from './node-engine-manifest.ts';

suite('node-engine-manifest', function () {
    suite('Node ranges', function () {
        const ranges = [
            [ '>=22', '>=22', true ],
            [ '>=22', '>=20', true ],
            [ '>=20', '>=22', false ],
            [ '^22 || ^24', '^22', false ],
            [ '>=22', '>=22 <25', false ],
            [ '^22 || ^24', '>=20', true ],
            [ '>=22.1', '>=22.2', false ],
            [ '>=22.2', '>=22.1', true ],
            [ '>=22', '*', true ],
            [ '*', '>=22', false ],
            [ '22.0.0-beta.1', '>=22.0.0-beta.0', true ],
            [ '22.0.0-beta.1', '>=22.0.0', false ],
            [ '22.0.0-beta.1', '*', true ]
        ] as const;
        for (const [ packageRange, dependencyRange, expected ] of ranges) {
            test(`${packageRange} contained in ${dependencyRange}: ${expected}`, function () {
                assert.strictEqual(supportsNodeRange(packageRange, dependencyRange), expected);
            });
        }

        for (const invalid of [ null, undefined, 22, '', ' '.repeat(3), 'node22' ]) {
            test(`rejects invalid engine ${JSON.stringify(invalid)}`, function () {
                assert.throws(function () {
                    validateNodeRange(invalid);
                }, /Invalid engines.node requirement/u);
            });
        }

        test('preserves a valid Node range', function () {
            assert.strictEqual(validateNodeRange('^22 || ^24'), '^22 || ^24');
        });
    });

    suite('node-engine-manifest dependency metadata', function () {
        test('reports schema validation errors instead of accessing failed parse results', function () {
            assert.throws(function () {
                readNodeEngineManifest({ dependencies: { dep: 1 } });
            }, {
                name: 'FormattedZodError',
                message: 'Validation failed: at dependencies.dep: expected string, but got number'
            });
        });

        test('selects required dependencies and peers and ignores dev and optional edges', function () {
            const result = readNodeEngineManifest({
                version: '2.0.0',
                engines: { node: '>=22', npm: '>=10' },
                dependencies: { required: '*', shared: '*', overridden: '*' },
                optionalDependencies: { overridden: '*', optional: '*' },
                peerDependencies: { peer: '*', shared: '*', optionalPeer: '*' },
                peerDependenciesMeta: { optionalPeer: { optional: true }, peer: { optional: false } },
                devDependencies: { dev: '*' }
            });
            assert.deepStrictEqual(result, {
                nodeRange: '>=22',
                version: '2.0.0',
                requiredDependencyNames: [ 'peer', 'required', 'shared' ]
            });
        });

        test('allows manifests without version or engine metadata', function () {
            assert.deepStrictEqual(readNodeEngineManifest({}), {
                nodeRange: undefined,
                version: undefined,
                requiredDependencyNames: []
            });
        });

        test('keeps required peers with no optional metadata', function () {
            assert.deepStrictEqual(
                readNodeEngineManifest({
                    peerDependencies: { peer: '*' },
                    peerDependenciesMeta: { peer: {} }
                })
                    .requiredDependencyNames,
                [ 'peer' ]
            );
        });

        for (
            const manifest of [
                null,
                { dependencies: [] },
                { dependencies: { dep: 1 } },
                { engines: { node: 22 } },
                { peerDependenciesMeta: { dep: { optional: 'yes' } } },
                { dependencies: { '../escape': '*' } },
                { dependencies: { 'dep@1': '*' } }
            ]
        ) {
            test(`rejects malformed manifest ${JSON.stringify(manifest)}`, function () {
                assert.throws(function () {
                    readNodeEngineManifest(manifest);
                }, Error);
            });
        }
    });
});
