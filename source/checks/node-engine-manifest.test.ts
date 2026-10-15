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
        test('orders dependencies consistently across locales', function () {
            assert.deepStrictEqual(
                readNodeEngineManifest({ dependencies: { a: '*', B: '*' } }).requiredDependencyNames,
                [ 'B', 'a' ]
            );
        });

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

    suite('Historical engine metadata', function () {
        test('reads historical engine arrays without dropping required dependencies', function () {
            assert.deepStrictEqual(
                readNodeEngineManifest({
                    version: '1.3.1',
                    engines: [ 'node >= 0.2.0', 'npm >=1' ],
                    dependencies: { required: '*' }
                }),
                {
                    nodeRange: '>= 0.2.0',
                    version: '1.3.1',
                    requiredDependencyNames: [ 'required' ]
                }
            );
        });

        test('keeps historical manifests without a Node requirement unconstrained', function () {
            assert.strictEqual(readNodeEngineManifest({ engines: [ 'npm >=1' ] }).nodeRange, undefined);
        });

        test('normalizes whitespace in historical engine requirements', function () {
            assert.strictEqual(readNodeEngineManifest({ engines: [ '\t node\t >= 0.2.0 \n' ] }).nodeRange, '>= 0.2.0');
        });

        test('accepts single-character names for other historical engines', function () {
            assert.strictEqual(readNodeEngineManifest({ engines: [ 'v >=1' ] }).nodeRange, undefined);
        });

        test('identifies historical requirements without a range', function () {
            assert.throws(function () {
                readNodeEngineManifest({ engines: [ 'node' ] });
            }, { message: 'Invalid legacy engine requirement: "node"' });
        });

        test('identifies duplicate historical requirements', function () {
            assert.throws(function () {
                readNodeEngineManifest({ engines: [ 'node >=20', 'node >=22' ] });
            }, { message: 'Duplicate legacy engine requirements' });
        });

        for (const engines of [ [ 'node' ], [ 'node invalid' ], [ 22 ], [ 'node >=20', 'node >=22' ] ]) {
            test(`rejects malformed historical engines ${JSON.stringify(engines)}`, function () {
                assert.throws(function () {
                    readNodeEngineManifest({ engines });
                }, Error);
            });
        }
    });
});
