import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid,
    observeDeadCodeEliminationBehavior
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import {
    deadCodeEliminationSemanticProgram,
    deadCodeEliminationSemanticScenarios,
    type DeadCodeEliminationSemanticScenario
} from '../test-libraries/dead-code-elimination-semantic-programs.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../source-transformation/source-preparation.ts';
import { prepareInitialRuntimeSource } from './transform/runtime-source-preparation.ts';

suite('dead code elimination semantic regressions', function () {
    for (const expression of [ '(0, eval)("typeof hidden")', '-1', '-0', '1 / 0', '-1 / 0', '0 / 0' ]) {
        test(`preserves ${expression} without source edits`, function () {
            const content = `export function api() { return ${expression}; }`;
            const preparation = createSourcePreparation(createProject().createSourceFile('index.js', content));
            prepareInitialRuntimeSource({
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
        const original = await observeDeadCodeEliminationBehavior({
            name: program.name,
            entry: program.entry,
            bundles: [ program.bundle ]
        });
        assert.partialDeepStrictEqual(original, [ {
            result: { observation: { error: { phase: 'evaluation', type: 'object', name: 'TypeError' } } }
        } ]);
        await assertDeadCodeEliminationEquivalent({
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
            await assertDeadCodeEliminationEquivalent({
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
});
