import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { reduceOptionalChains } from './optional-chain-reduction.ts';

suite('optional chain reduction', function () {
    for (
        const [ expression, expected ] of [
            [ 'null?.first.second?.(effect())', '(void 0)' ],
            [ 'unknown?.(null?.value)', 'unknown?.((void 0))' ],
            [ '(null?.value).field', '((void 0)).field' ],
            [ '(1)?.toString()', '(1)?.toString()' ],
            [ '(1)?.missing!.field', '(1)?.missing!.field' ],
            [ 'null.value', 'null.value' ],
            [ '(null?.value)!', '((void 0))!' ],
            [ 'unknown?.value', 'unknown?.value' ]
        ]
    ) {
        test(`preserves optional chain boundaries in ${expression}`, function () {
            const source = createProject().createSourceFile('input.ts', `export const result=${expression};`);
            reduceOptionalChains(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), `export const result=${expected};`);
        });
    }
});
