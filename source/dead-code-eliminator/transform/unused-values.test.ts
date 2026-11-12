import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createExpressionPurityChecker } from '../pure-expression.ts';
import { removeUnusedValues } from './unused-values.ts';

suite('unused uninitialized bindings', function () {
    for (
        const [ statement, expected ] of [
            [ 'pure(first(),second());', '(first());(second());' ],
            [ 'if(condition)pure(first(),second());', 'if(condition){ (first());(second()); }' ]
        ]
    ) {
        test(`preserves ordered argument effects in ${statement}`, function () {
            const declaration = 'function pure(value){return value;}';
            const source = createProject().createSourceFile('input.ts', declaration + statement);
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), declaration + expected);
        });
    }

    for (
        const content of [
            'const hidden=effect();eval("hidden");',
            '"use strict";export function value(){return 42;}'
        ]
    ) {
        test(`preserves dynamic bindings and directives in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), content);
        });
    }

    test('removes unused values inside an exported function body', function () {
        const source = createProject().createSourceFile('input.ts', 'export function use(){const unused=1;return 42;}');
        removeUnusedValues(
            createSourcePreparation(source),
            createExpressionPurityChecker(undefined, function () {
                return undefined;
            })
        );
        assert.doesNotMatch(source.getFullText(), /unused/u);
        assert.match(source.getFullText(), /return 42/u);
    });

    test('does not plan edits inside a removed function initializer', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            'const unused=(effect(),()=>{const nested=sideEffect();});export const value=42;'
        );
        removeUnusedValues(
            createSourcePreparation(source),
            createExpressionPurityChecker(undefined, function () {
                return undefined;
            })
        );
        assert.strictEqual(source.getFullText(), '(effect());export const value=42;');
    });

    test('drops an unused declarator while retaining an observed sibling', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            'const unused=1, kept=unknown();consume(kept);'
        );
        removeUnusedValues(
            createSourcePreparation(source),
            createExpressionPurityChecker(undefined, function () {
                return undefined;
            })
        );
        assert.strictEqual(source.getFullText(), ';const kept=unknown();consume(kept);');
    });

    for (const kind of [ 'let', 'var' ]) {
        test(`removes unused ${kind} declarations without an initializer`, function () {
            const source = createProject().createSourceFile('input.ts', `${kind} unused;export const value=42;`);
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), ';export const value=42;');
        });

        test(`retains observed ${kind} declarations without an initializer`, function () {
            const content = `${kind} value;export function read(){return value;}`;
            const source = createProject().createSourceFile('input.ts', content);
            const preparation = createSourcePreparation(source);
            removeUnusedValues(
                preparation,
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), content);
            assert.deepStrictEqual(preparation.transformations, []);
        });
    }
});
