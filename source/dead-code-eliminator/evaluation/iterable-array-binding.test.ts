import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { opaqueResult } from './abstract-value.ts';
import { iterableArrayBindingValue } from './iterable-array-binding.ts';

function lastBaseRead(content: string): ReturnType<typeof iterableArrayBindingValue> {
    const source = createProject().createSourceFile('input.js', `${content}\nexport {};`);
    const reads = source.getDescendantsOfKind(SyntaxKind.Identifier).filter(function (identifier) {
        return identifier.getText() === 'base';
    });
    const read = reads.at(-1);
    assertDefined(read);
    return iterableArrayBindingValue(read);
}

suite('iterable array binding', function () {
    test('reads a const array that is only iterated as an array of unknown contents', function () {
        assert.deepStrictEqual(
            lastBaseRead('const base = [ 1 ];\nconst copy = [ ...base ];'),
            opaqueResult('array')
        );
    });

    for (
        const content of [
            'const copy = [ ...base ];\nconst base = [ 1 ];',
            'const base = { length: 1 };\nconst copy = [ ...base ];',
            'let base = [ 1 ];\nconst copy = [ ...base ];',
            'const base = [ 1 ];\nconsume(base);\nconst copy = [ ...base ];'
        ]
    ) {
        test(`does not read an iterable array for: ${content}`, function () {
            assert.strictEqual(lastBaseRead(content), undefined);
        });
    }
});
