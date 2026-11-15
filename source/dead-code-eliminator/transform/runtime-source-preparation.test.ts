import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { specializeExpressions } from './expression-specialization.ts';
import { prepareInitialRuntimeSource, prepareResolvedRuntimeSource } from './runtime-source-preparation.ts';

suite('runtime preparation convergence', function () {
    for (const literal of [ '-0', '-1' ]) {
        test(`does not rewrite the canonical literal ${literal}`, function () {
            const content = `export const value=${literal};`;
            const preparation = createSourcePreparation(createProject().createSourceFile('input.ts', content));
            specializeExpressions(preparation);
            assert.strictEqual(preparation.sourceFile.getFullText(), content);
            assert.deepStrictEqual(preparation.transformations, []);
        });
    }

    for (
        const content of [
            '',
            'eval("unknown()");(()=>42)();',
            'function identity(value){return value;}const invalid={__proto__:null,__proto__:null};' +
            'export const result=identity(42);'
        ]
    ) {
        test(`keeps ineligible preparation unchanged for ${content}`, function () {
            const preparation = createSourcePreparation(createProject().createSourceFile('input.ts', content));
            prepareInitialRuntimeSource({
                ...preparation,
                applyEdits() {
                    assert.fail('ineligible sources must not schedule transformations');
                }
            });
            assert.strictEqual(preparation.sourceFile.getFullText(), content);
        });
    }

    test('stops when a pass leaves the source unchanged', function () {
        const preparation = createSourcePreparation(
            createProject().createSourceFile('input.ts', 'export const value=1;')
        );
        let applications = 0;
        prepareInitialRuntimeSource({
            ...preparation,
            applyEdits(edits) {
                applications += 1;
                assert.ok(applications <= 3);
                preparation.applyEdits(edits);
            }
        });
        assert.ok(applications > 0);
        assert.strictEqual(preparation.sourceFile.getFullText(), 'export const value=1;');
    });

    test('bounds transformation work when every pass changes the source', function () {
        const preparation = createSourcePreparation(
            createProject().createSourceFile('input.ts', 'export const value=1;')
        );
        let applications = 0;
        const changingPreparation: SourcePreparation = {
            ...preparation,
            applyEdits(edits) {
                applications += 1;
                assert.ok(applications <= 100);
                preparation.applyEdits(edits);
                const end = preparation.sourceFile.getFullText().length;
                preparation.applyEdits([ { start: end, end, content: ';' } ]);
            }
        };
        prepareInitialRuntimeSource(changingPreparation);
        assert.strictEqual(applications, 64);
    });

    suite('runtime source preparation', function () {
        test('does not request imported values for a source with early errors', function () {
            const content = 'import {answer} from "./dependency.js";' +
                'const invalid={__proto__:null,__proto__:null};export const value=answer;';
            const source = createProject().createSourceFile('index.js', content);
            prepareResolvedRuntimeSource(createSourcePreparation(source), function () {
                return assert.fail('Invalid sources cannot supply imported value proofs');
            }, function () {
                return assert.fail('Invalid sources cannot supply purity proofs');
            });
            assert.strictEqual(source.getFullText(), content);
        });

        test('specializes imported values before local evaluation', function () {
            const source = createProject().createSourceFile(
                'index.js',
                'import {answer} from "./dependency.js";export const value=answer*2;'
            );
            prepareResolvedRuntimeSource(createSourcePreparation(source), function (expression) {
                return expression.getText() === 'answer' ? { value: 21 } : undefined;
            }, function () {
                return false;
            });
            assert.strictEqual(source.getVariableDeclarationOrThrow('value').getInitializerOrThrow().getText(), '(42)');
        });

        test('folds local calls before reachability analysis', function () {
            const source = createProject().createSourceFile(
                'index.js',
                'function compute(){return 21*2;}export const value=compute();'
            );
            prepareInitialRuntimeSource(createSourcePreparation(source));
            assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.CallExpression).length, 0);
            assert.strictEqual(source.getVariableDeclarationOrThrow('value').getInitializerOrThrow().getText(), '(42)');
        });
    });
});
