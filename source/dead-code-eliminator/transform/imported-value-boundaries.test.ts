import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { specializeImportedValues } from './imported-value-specialization.ts';

suite('imported value specialization', function () {
    test('replaces proven imported values in ordinary lexical scopes', function () {
        const source = createProject().createSourceFile(
            'input.js',
            'import {value} from "./dependency.js";export const result=value;'
        );
        specializeImportedValues(createSourcePreparation(source), function (expression) {
            return expression.getText() === 'value' ? { value: 42 } : undefined;
        });
        assert.strictEqual(source.getVariableDeclarationOrThrow('result').getInitializerOrThrow().getText(), '(42)');
    });

    test('does not query imported values through direct eval', function () {
        const content = 'import {value} from "./dependency.js";eval("value");export const result=value;';
        const source = createProject().createSourceFile('input.js', content);
        specializeImportedValues(createSourcePreparation(source), function () {
            return assert.fail('Direct eval must keep lexical reads intact');
        });
        assert.strictEqual(source.getFullText(), content);
    });
});
