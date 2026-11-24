import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { importedResult, typeOfResult } from './abstract-value.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { establishEvaluationEnvironment } from './evaluation-environment-establishment.ts';

function canDiscardValue(content: string): boolean {
    const source = createProject().createSourceFile('input.js', `${content}\nexport {};`);
    establishEvaluationEnvironment(
        [ source ],
        { enabled: true, pureImports: [ { from: 'lib' } ] },
        resolveRuntimeModule
    );
    const expression = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    return createSourceEvaluation(source).canDiscard(expression);
}

suite('imported values', function () {
    for (
        const content of [
            'import * as lib from "lib";\nconst value = lib.member;',
            'import * as lib from "lib";\nconst value = lib.member.nested;',
            'import { make } from "lib";\nconst value = make();',
            'import * as lib from "lib";\nconst value = lib.member.make();',
            'import { make } from "lib";\nconst alias = make;\nconst value = alias();'
        ]
    ) {
        test(`evaluates a trusted import without effects: ${content}`, function () {
            assert.strictEqual(canDiscardValue(content), true);
        });
    }

    for (
        const content of [
            'import { other } from "other-lib";\nconst value = other.member;',
            'import { other } from "other-lib";\nconst value = other();',
            'const value = missing.member;',
            'import { make } from "lib";\nfunction probe() { return make; }\nconst value = probe();'
        ]
    ) {
        test(`keeps an untrusted or unproven import observable: ${content}`, function () {
            assert.strictEqual(canDiscardValue(content), false);
        });
    }

    test('reports an imported callable as a function', function () {
        assert.strictEqual(typeOfResult(importedResult('callable', { from: 'lib', path: [ 'make' ] })), 'function');
    });
});
