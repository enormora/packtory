import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createSourcePreparation } from '../source-transformation/source-preparation.ts';
import {
    assertDeadCodeEliminationOutput,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-output-assertions.ts';
import {
    deadCodeEliminationSemanticProgram,
    deadCodeEliminationSemanticScenarios,
    type DeadCodeEliminationSemanticScenario
} from '../test-libraries/dead-code-elimination-semantic-programs.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { prepareLocalRuntimeSource } from './transform/local-source-preparation.ts';

suite('dead code elimination semantic regressions', function () {
    for (const expression of [ '(0, eval)("typeof hidden")', '-1', '-0', '1 / 0', '-1 / 0', '0 / 0' ]) {
        test(`preserves ${expression} without source edits`, function () {
            const content = `export function api() { return ${expression}; }`;
            const preparation = createSourcePreparation(createProject().createSourceFile('index.js', content));
            prepareLocalRuntimeSource({
                ...preparation,
                applyEdits(edits) {
                    assert.deepStrictEqual(edits, [], 'canonical runtime expressions must not require source edits');
                }
            });
            assert.strictEqual(preparation.sourceFile.getFullText(), content);
        });
    }

    test('negative class heritage reaches a runtime TypeError', async function () {
        const program = deadCodeEliminationSemanticProgram({
            scenario: 'invalid-heritage',
            value: -1,
            declarations: false,
            singleLine: false,
            sourceSkew: false
        });
        await assertDeadCodeEliminationOutput({
            name: program.name,
            entry: program.entry,
            eliminationInputs: inputs(program.bundle)
        });
    });
    for (const scenario of Object.keys(deadCodeEliminationSemanticScenarios) as DeadCodeEliminationSemanticScenario[]) {
        test(`preserves ${scenario}`, async function () {
            const program = deadCodeEliminationSemanticProgram({
                scenario,
                value: 7,
                declarations: false,
                singleLine: false,
                sourceSkew: false
            });
            await assertDeadCodeEliminationOutput({
                name: program.name,
                entry: program.entry,
                eliminationInputs: inputs(program.bundle)
            });
        });
    }
    for (const singleLine of [ false, true ]) {
        test(`removes pure declarations beside effects, single line ${String(singleLine)}`, async function () {
            const program = deadCodeEliminationSemanticProgram({
                scenario: 'object-getter',
                value: 7,
                declarations: false,
                singleLine,
                sourceSkew: false
            });
            const result = await eliminateDeadCodeAndAssertAllOutputValid({
                name: program.name,
                entry: program.entry,
                eliminationInputs: inputs(program.bundle)
            });
            assert.strictEqual(
                result
                    .flatMap(function (bundle) {
                        return bundle.contents;
                    })
                    .some(function (resource) {
                        return resource.fileDescription.content.includes('independentConstant');
                    }),
                false
            );
        });
    }

    test('retains an unreferenced module with observable side effects', async function () {
        const entry = {
            ...bundleResource('/source/index.js', { targetFilePath: 'index.js', content: 'export const api = 7;' }),
            isSubstituted: false
        };
        const effect = {
            ...bundleResource('/source/orphan.js', {
                targetFilePath: 'orphan.js',
                content: 'globalThis.events.push("orphan");'
            }),
            isSubstituted: false
        };
        const bundle = linkedBundle({
            name: 'package',
            contents: [ entry, effect ],
            roots: { main: { javaScript: entry.fileDescription } }
        });
        const result = await eliminateDeadCodeAndAssertAllOutputValid({
            name: 'unreferenced side effects',
            entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'api' },
            eliminationInputs: inputs(bundle)
        });
        assert.deepStrictEqual(
            result.map(function (output) {
                return {
                    sideEffects: output.sideEffectsField,
                    files: output.contents.map(function (resource) {
                        return {
                            path: resource.fileDescription.targetFilePath,
                            content: resource.fileDescription.content
                        };
                    })
                };
            }),
            [ {
                sideEffects: [ './orphan.js' ],
                files: [
                    { path: 'index.js', content: 'export const api = 7;' },
                    { path: 'orphan.js', content: 'globalThis.events.push("orphan");' }
                ]
            } ]
        );
    });
});
