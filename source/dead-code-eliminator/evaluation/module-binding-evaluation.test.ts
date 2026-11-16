import assert from 'node:assert';
import { SyntaxKind, type Identifier, type SourceFile } from 'ts-morph';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { createModuleBindingEvaluator, createModuleConstantReader } from './module-binding-evaluation.ts';

function capturedRead(source: SourceFile): Identifier {
    return source
        .getFunctionOrThrow('read')
        .getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement)
        .getExpressionOrThrow()
        .asKindOrThrow(SyntaxKind.Identifier);
}

suite('module binding evaluation', function () {
    for (const initialized of [ true, false ]) {
        test(`caches initialization proof ${initialized} across repeated binding reads`, function () {
            const source = createProject().createSourceFile('/index.js', 'export const value=42;');
            const declaration = source.getVariableDeclarationOrThrow('value');
            let proofs = 0;
            let evaluations = 0;
            const evaluate = createModuleBindingEvaluator({
                initializesBinding(binding) {
                    assert.strictEqual(binding, declaration);
                    proofs += 1;
                    assert.strictEqual(proofs, 1);
                    return initialized;
                },
                evaluateSource(file) {
                    assert.strictEqual(file, source);
                    evaluations += 1;
                    return createSourceEvaluation(file);
                }
            });
            assert.deepStrictEqual(evaluate(declaration), initialized ? { value: 42 } : undefined);
            assert.deepStrictEqual(evaluate(declaration), initialized ? { value: 42 } : undefined);
            assert.strictEqual(evaluations, initialized ? 1 : 0);
            assert.strictEqual(proofs, 1);
        });
    }

    test('shares source evaluation across distinct bindings and keeps module caches separate', function () {
        const project = createProject();
        const first = project.createSourceFile('/first.js', 'export const a=1,b=2;');
        const second = project.createSourceFile('/second.js', 'export const c=3;');
        const evaluated = new Set();
        const evaluate = createModuleBindingEvaluator({
            initializesBinding() {
                return true;
            },
            evaluateSource(source) {
                assert.strictEqual(evaluated.has(source), false);
                evaluated.add(source);
                return createSourceEvaluation(source);
            }
        });
        assert.deepStrictEqual(evaluate(first.getVariableDeclarationOrThrow('a')), { value: 1 });
        assert.deepStrictEqual(evaluate(first.getVariableDeclarationOrThrow('b')), { value: 2 });
        assert.deepStrictEqual(evaluate(second.getVariableDeclarationOrThrow('c')), { value: 3 });
        assert.strictEqual(evaluated.size, 2);
    });

    test('rejects unsupported declarations before initialization or evaluation', function () {
        const source = createProject().createSourceFile('/index.js', 'export function value(){}');
        const evaluate = createModuleBindingEvaluator({
            initializesBinding() {
                assert.fail('unsupported declarations cannot provide initialization facts');
            },
            evaluateSource() {
                assert.fail('unsupported declarations cannot provide constant values');
            }
        });
        assert.strictEqual(evaluate(source.getFunctionOrThrow('value')), undefined);
    });

    suite('initialized module captures', function () {
        for (
            const [ content, expected ] of [
                [ 'const value=42;export function read(){return value;}', { value: 42 } ],
                [ 'export function read(){return undefined;}', { value: undefined } ],
                [ 'const undefined=7;export function read(){return undefined;}', { value: 7 } ],
                [ 'let value=42;export function read(){return value;}', undefined ],
                [ 'export function read(){return value;const value=42;}', undefined ],
                [ 'const value=missing();export function read(){return value;}', undefined ],
                [ 'const value={answer:42};export function read(){return value;}', undefined ],
                [ 'export function read(){return missing;}', undefined ]
            ] as const
        ) {
            test(`reads only proven primitive module constants in ${content}`, function () {
                const source = createProject().createSourceFile('/index.js', content);
                const read = createModuleConstantReader(source, createSourceEvaluation(source));
                assert.deepStrictEqual(read(capturedRead(source)), expected);
            });
        }

        for (const initializer of [ '42', 'missing()' ]) {
            test(`evaluates the capture proof once for ${initializer}`, function () {
                const source = createProject().createSourceFile(
                    '/index.js',
                    `const value=${initializer};export function read(){return value;}`
                );
                const evaluation = createSourceEvaluation(source);
                let proofs = 0;
                const read = createModuleConstantReader(source, {
                    ...evaluation,
                    primitiveValue(expression) {
                        proofs += 1;
                        return evaluation.primitiveValue(expression);
                    }
                });
                const expected = initializer === '42' ? { value: 42 } : undefined;
                assert.deepStrictEqual(read(capturedRead(source)), expected);
                assert.deepStrictEqual(read(capturedRead(source)), expected);
                assert.strictEqual(proofs, 1);
            });
        }

        test('does not assume initialization of global script bindings from another file', function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/globals.js', content: 'const value=42;' },
                    { filePath: '/index.js', content: 'export function read(){return value;}' }
                ]
            });
            const source = project.getSourceFileOrThrow('/index.js');
            const identifier = capturedRead(source);
            assert.strictEqual(
                identifier.getSymbolOrThrow().getValueDeclaration()?.getSourceFile(),
                project.getSourceFileOrThrow('/globals.js')
            );
            const read = createModuleConstantReader(source, createSourceEvaluation(source));
            assert.strictEqual(read(identifier), undefined);
        });
    });
});
