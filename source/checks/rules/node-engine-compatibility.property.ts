import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { engineCheckInput, engineFileManager } from '../../test-libraries/node-engine-fixtures.ts';
import { createNodeEngineCompatibilityRule } from './node-engine-compatibility.ts';

function requiredEngineChain(leafMinimum: number, depth: number): Readonly<Record<string, unknown>> {
    const manifests: Record<string, unknown> = {};
    for (let index = 0; index < depth; index += 1) {
        manifests[`/repo/node_modules/dep${index}`] = index === depth - 1
            ? { engines: { node: `>=${leafMinimum}.0.0` } }
            : { dependencies: { [`dep${index + 1}`]: '*' } };
    }
    return manifests;
}

suite('Node engine compatibility across required dependency chains', function () {
    test('a transitive minimum constrains the original package at every depth', async function () {
        await fc.assert(fc.asyncProperty(
            fc.integer({ min: 1, max: 30 }),
            fc.integer({ min: 1, max: 30 }),
            fc.integer({ min: 1, max: 6 }),
            async function (rootMinimum, leafMinimum, depth) {
                const manifests = requiredEngineChain(leafMinimum, depth);
                const rule = createNodeEngineCompatibilityRule({
                    fileManager: engineFileManager(manifests, {}, Array.of<string>())
                });
                const issues = await rule.run(engineCheckInput({
                    engines: { node: `>=${rootMinimum}.0.0` },
                    dependencies: { dep0: '*' }
                }));
                assert.strictEqual(issues.length, rootMinimum >= leafMinimum ? 0 : 1);
                if (rootMinimum < leafMinimum) {
                    assert.match(issues[0] ?? '', /is not a subset/u);
                    assert.ok((issues[0] ?? '').includes(`dep${depth - 1}:`));
                }
            }
        ));
    });
});
