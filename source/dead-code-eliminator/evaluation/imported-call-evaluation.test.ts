import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { evaluateImportedCall } from './imported-call-evaluation.ts';

suite('imported call evaluation', function () {
    for (const argumentsText of [ '', '21,missing' ]) {
        test(`requires every argument to be known in (${argumentsText})`, function () {
            const project = createProject();
            const provider = project.createSourceFile('dep.js', 'export function twice(){return 42;}');
            const consumer = project.createSourceFile('index.js', `twice(${argumentsText});`);
            const call = consumer.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.deepStrictEqual(
                evaluateImportedCall(
                    call,
                    { kind: 'callable', source: provider, name: 'twice' },
                    createSourceEvaluation
                ),
                argumentsText === '' ? { value: 42 } : undefined
            );
        });
    }
    for (const content of [ 'export {};', 'export async function twice(value){return value*2;}' ]) {
        test(`rejects a stale or unsupported callable in ${content}`, function () {
            const project = createProject();
            const provider = project.createSourceFile('dep.js', content);
            const consumer = project.createSourceFile('index.js', 'twice(21);');
            const call = consumer.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.strictEqual(
                evaluateImportedCall(call, { kind: 'callable', source: provider, name: 'twice' }, function () {
                    assert.fail('An unavailable callable cannot evaluate its arguments');
                }),
                undefined
            );
        });
    }

    test('retains spread arguments and their iteration', function () {
        const project = createProject();
        const provider = project.createSourceFile('dep.js', 'export function twice(value){return value*2;}');
        const consumer = project.createSourceFile('index.js', 'twice(...[21]);');
        const call = consumer.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
        assert.strictEqual(
            evaluateImportedCall(call, { kind: 'callable', source: provider, name: 'twice' }, createSourceEvaluation),
            undefined
        );
    });
});
