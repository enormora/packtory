import assert from 'node:assert';
import { suite, test } from 'mocha';
import { engineCheckInput, engineFileManager } from '../../test-libraries/node-engine-fixtures.ts';
import { createNodeEngineCompatibilityRule } from './node-engine-compatibility.ts';

async function check(
    fields: Readonly<Record<string, unknown>>,
    manifests: Readonly<Record<string, unknown>>
): Promise<readonly string[]> {
    return await createNodeEngineCompatibilityRule({
        fileManager: engineFileManager(manifests, {}, Array.of<string>())
    })
        .run(engineCheckInput(fields));
}

const rootFields = { engines: { node: '>=22' }, dependencies: { direct: '*' } };
const mismatch = 'Package "root" failed Node engine compatibility via root -> direct@1.0.0: ' +
    'engines.node ">=22" is not a subset of ">=24"';

suite('node-engine-compatibility', function () {
    suite('Required dependency ranges', function () {
        test('reports a direct dependency mismatch', async function () {
            assert.deepStrictEqual(
                await check(rootFields, {
                    '/repo/node_modules/direct': { version: '1.0.0', engines: { node: '>=24' } }
                }),
                [ mismatch ]
            );
        });

        test('accepts a dependency supporting a broader range', async function () {
            assert.deepStrictEqual(
                await check(rootFields, {
                    '/repo/node_modules/direct': { engines: { node: '>=20' } }
                }),
                []
            );
        });

        test('accepts historical dependency engines and continues into required children', async function () {
            assert.deepStrictEqual(
                await check(rootFields, {
                    '/repo/node_modules/direct': { engines: [ 'node >= 0.2.0' ], dependencies: { leaf: '*' } },
                    '/repo/node_modules/leaf': { version: '2.0.0', engines: { node: '>=24' } }
                }),
                [
                    'Package "root" failed Node engine compatibility via root -> direct -> leaf@2.0.0: ' +
                    'engines.node ">=22" is not a subset of ">=24"'
                ]
            );
        });

        test('enforces Node ranges declared in historical dependency engines', async function () {
            assert.deepStrictEqual(
                await check(rootFields, {
                    '/repo/node_modules/direct': { version: '1.0.0', engines: [ 'node >=24' ] }
                }),
                [ mismatch ]
            );
        });

        test('follows transitive dependencies and peers through packages with no Node engine', async function () {
            assert.deepStrictEqual(
                await check(rootFields, {
                    '/repo/node_modules/direct': { version: '1.0.0', peerDependencies: { peer: '*' } },
                    '/repo/node_modules/peer': { dependencies: { leaf: '*' } },
                    '/repo/node_modules/leaf': { version: '2.0.0', engines: { node: '>=24' } }
                }),
                [
                    'Package "root" failed Node engine compatibility via root -> direct@1.0.0 -> peer -> leaf@2.0.0: ' +
                    'engines.node ">=22" is not a subset of ">=24"'
                ]
            );
        });

        test('continues checking descendants after an engine mismatch', async function () {
            const issues = await check(rootFields, {
                '/repo/node_modules/direct': {
                    version: '1.0.0',
                    engines: { node: '>=24' },
                    dependencies: { leaf: '*' }
                },
                '/repo/node_modules/leaf': { engines: { node: '>=26' } }
            });
            assert.strictEqual(issues.length, 2);
            assert.ok(issues.includes(mismatch));
            assert.ok(issues.some(function (issue) {
                return issue.includes('direct@1.0.0 -> leaf');
            }));
        });

        test('checks required direct peers', async function () {
            assert.deepStrictEqual(
                await check({ engines: { node: '>=22' }, peerDependencies: { direct: '*' } }, {
                    '/repo/node_modules/direct': { version: '1.0.0', engines: { node: '>=24' } }
                }),
                [ mismatch ]
            );
        });
    });

    suite('node-engine-compatibility exclusions and failures', function () {
        test('ignores development and optional branches without reading their manifests', async function () {
            const reads: string[] = [];
            const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, reads) });
            const issues = await rule.run(engineCheckInput({
                engines: { node: '>=22' },
                dependencies: { optional: '*' },
                optionalDependencies: { optional: '*' },
                devDependencies: { dev: '*' },
                peerDependencies: { peer: '*' },
                peerDependenciesMeta: { peer: { optional: true } }
            }));
            assert.deepStrictEqual(issues, []);
            assert.deepStrictEqual(reads, []);
        });

        test('checks a shared optional package when it also has a required path', async function () {
            const issues = await check({ ...rootFields, optionalDependencies: { shared: '*' } }, {
                '/repo/node_modules/direct': { dependencies: { shared: '*' } },
                '/repo/node_modules/shared': { engines: { node: '>=24' } }
            });
            assert.strictEqual(issues.length, 1);
            assert.match(issues[0] ?? '', /root -> direct -> shared/u);
        });

        test('skips packages without engines.node even when required dependencies are missing', async function () {
            assert.deepStrictEqual(
                await check({ dependencies: { missing: '*' }, engines: { npm: '>=10' } }, {}),
                Array.of<string>()
            );
        });

        test('reports invalid root ranges before filesystem access', async function () {
            for (const range of [ '', 'invalid', 22 ]) {
                const issues = await check({ engines: { node: range }, dependencies: { missing: '*' } }, {});
                assert.strictEqual(issues.length, 1);
                assert.match(issues[0] ?? '', /Invalid engines.node/u);
            }
        });

        test('reports invalid dependency ranges and still traverses their descendants', async function () {
            const issues = await check(rootFields, {
                '/repo/node_modules/direct': { engines: { node: 'invalid' }, dependencies: { missing: '*' } }
            });
            assert.strictEqual(issues.length, 2);
            assert.ok(issues.some(function (issue) {
                return issue.includes('Invalid engines.node');
            }));
            assert.ok(issues.some(function (issue) {
                return issue.includes('Required dependency "missing"');
            }));
        });

        for (const manifest of [ new Error('permission denied'), '{', { dependencies: { bad: 1 } } ]) {
            test(`reports unreadable or malformed manifests: ${JSON.stringify(manifest)}`, async function () {
                const issues = await check(rootFields, { '/repo/node_modules/direct': manifest });
                assert.strictEqual(issues.length, 1);
                assert.match(issues[0] ?? '', /root -> direct:/u);
            });
        }

        test('fails on missing required dependencies and peers', async function () {
            const issues = await check({ ...rootFields, peerDependencies: { peer: '*' } }, {});
            assert.deepStrictEqual(issues, [
                'Package "root" failed Node engine compatibility via root -> direct: ' +
                'Error: Required dependency "direct" is not installed',
                'Package "root" failed Node engine compatibility via root -> peer: ' +
                'Error: Required dependency "peer" is not installed'
            ]);
        });

        test('does no filesystem work when disabled or omitted', async function () {
            const reads: string[] = [];
            const rule = createNodeEngineCompatibilityRule({ fileManager: engineFileManager({}, {}, reads) });
            for (const settings of [ undefined, {}, { nodeEngineCompatibility: { enabled: false } } ]) {
                assert.deepStrictEqual(
                    await rule.run({ ...engineCheckInput(rootFields), settings }),
                    Array.of<string>()
                );
            }
            assert.deepStrictEqual(reads, []);
        });

        test('reports a missing generated manifest as an internal invariant failure', async function () {
            const rule = createNodeEngineCompatibilityRule({
                fileManager: engineFileManager({}, {}, Array.of<string>())
            });
            await assert.rejects(async function () {
                await rule.run({ ...engineCheckInput(rootFields), publishedPackages: undefined });
            }, /Published package missing/u);
        });
    });
});
