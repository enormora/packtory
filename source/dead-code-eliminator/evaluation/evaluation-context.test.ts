import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { declarationOf } from './evaluation-context.ts';

suite('evaluation declarations', function () {
    test('rejects an identifier with merged declarations', function () {
        const source = createProject().createSourceFile('input.ts', 'var value=1;var value=2;const read=value;');
        const read = source.getVariableDeclarationOrThrow('read').getInitializerOrThrow();
        assert.strictEqual(declarationOf(read), undefined);
    });
});
