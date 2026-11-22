import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../source/test-libraries/typescript-project.ts';
import { createTestEliminator } from '../../source/test-libraries/eliminator-fixtures.ts';
import { moduleEliminationInputs } from '../../source/test-libraries/eliminator-test-support.ts';
import { assertDeepSubset } from '../../source/test-libraries/deep-subset-assertion.ts';
import { collectDeadCodeEliminationOutputIssues } from '../../source/dead-code-eliminator/invariants/output-invariants.ts';
import {
    assertDeadCodeEliminationBehaviorEquivalent,
    observeDeadCodeEliminationBehavior
} from './runtime-comparison.ts';

const cases = [
    {
        name: 'missing forwarded name',
        content: 'import "./barrel.js";export function probe(){return 42;}',
        modules: { 'barrel.js': 'export {missing} from "./dep.js";', 'dep.js': 'export {};' },
        issue: 'package: barrel.js imports missing from ./dep.js, but dep.js does not export it in runtime mode'
    },
    {
        name: 'missing local name',
        content: 'import "./dep.js";export function probe(){return 42;}',
        modules: { 'dep.js': 'export {missing};' },
        issue: 'package: dep.js exports local missing, but no local binding remains'
    },
    {
        name: 'missing imported name',
        content: 'import {missing} from "./dep.js";export function probe(){return 42;}',
        modules: { 'dep.js': 'export {};' },
        issue: 'package: index.js imports missing from ./dep.js, but dep.js does not export it in runtime mode'
    }
];

suite('empty module link failures', function () {
    for (const fixture of cases) {
        test(`preserves the link failure for ${fixture.name}`, async function () {
            const inputs = moduleEliminationInputs(fixture.content, fixture.modules);
            const original = inputs.map(function (input) {
                return input.bundle;
            });
            const eliminated = await createTestEliminator().eliminate(inputs);
            assert.deepStrictEqual(collectDeadCodeEliminationOutputIssues(eliminated, createProject), [
                fixture.issue
            ]);
            const entry = { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' };
            const native = await observeDeadCodeEliminationBehavior({ name: fixture.name, entry, bundles: original });
            assertDeepSubset(native[0]?.result.observation, { error: { name: 'SyntaxError' } });
            await assertDeadCodeEliminationBehaviorEquivalent({
                name: fixture.name,
                entry,
                leftName: 'original',
                leftBundles: original,
                rightName: 'eliminated',
                rightBundles: eliminated
            });
        });
    }
});
