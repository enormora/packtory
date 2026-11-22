import { suite, test } from 'mocha';
import { assertDeepSubset } from '../../source/test-libraries/deep-subset-assertion.ts';
import { moduleEliminationInputs } from '../../source/test-libraries/eliminator-test-support.ts';
import { assertDeadCodeEliminationEquivalent } from './runtime-comparison.ts';

suite('default namespace export runtime behavior', function () {
    for (const statement of [ 'export default ns;', 'export default (ns);', 'const alias=ns;export default alias;' ]) {
        for (const expression of [ 'ns.used', 'wrapped.default.used' ]) {
            test(`preserves ${expression} through ${statement}`, async function () {
                const content = 'import ns from "./barrel.js";import * as wrapped from "./barrel.js";' +
                    `export function probe(){return ${expression};}`;
                const { observations } = await assertDeadCodeEliminationEquivalent({
                    name: 'default namespace export',
                    entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
                    eliminationInputs: moduleEliminationInputs(content, {
                        'barrel.js': `import * as ns from "./dep.js";${statement}`,
                        'dep.js': 'export let used=42;export const unused=9;const dead=123;'
                    })
                });
                assertDeepSubset(observations[0]?.result.observation, { value: 42 });
            });
        }
    }
});
