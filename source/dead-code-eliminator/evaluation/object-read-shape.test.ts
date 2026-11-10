import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { objectReadShape, propertyIsDefined, type ObjectPropertyRead } from './object-read-shape.ts';

suite('object property reads', function () {
    for (
        const [ content, creationIsPure, read ] of [
            [ '{answer:42}', true, { getIsPure: true, value: { type: 'value', value: 42 } } ],
            [ '{answer:{}}', true, { getIsPure: true, value: { type: 'defined' } } ],
            [ '{answer:missing()}', false, { getIsPure: true, value: { type: 'unknown' } } ],
            [ '{answer:42,effect:missing()}', false, { getIsPure: true, value: { type: 'value', value: 42 } } ],
            [ '{get answer(){return 42;}}', true, { getIsPure: true, value: { type: 'value', value: 42 } } ],
            [ '{get answer(){return {};}}', true, { getIsPure: true, value: { type: 'defined' } } ],
            [ '{get answer(){return missing();}}', true, { getIsPure: false, value: { type: 'unknown' } } ],
            [ '{get answer(){effect();return 42;}}', true, { getIsPure: false, value: { type: 'unknown' } } ],
            [ '{answer(){}}', true, { getIsPure: true, value: { type: 'defined' } } ],
            [ '{set answer(value){}}', true, { getIsPure: true, value: { type: 'value', value: undefined } } ],
            [ '{__proto__:null}', true, { getIsPure: true, value: { type: 'value', value: undefined } } ],
            [ '{}', true, undefined ]
        ] as const
    ) {
        test(`separates creation effects from property reads for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', `(${content});`);
            const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
            const shape = objectReadShape(object, createSourceEvaluation(source).primitiveValue);
            assertDefined(shape);
            assert.strictEqual(shape.creationIsPure, creationIsPure);
            assert.deepStrictEqual(shape.propertyRead('answer'), read);
        });
    }

    const definedCases: readonly (readonly [ObjectPropertyRead['value'], boolean])[] = [
        [ { type: 'defined' }, true ],
        [ { type: 'unknown' }, false ],
        [ { type: 'value', value: undefined }, false ],
        [ { type: 'value', value: null }, true ],
        [ { type: 'value', value: 0 }, true ]
    ];
    for (const [ value, expected ] of definedCases) {
        test(`checks whether ${JSON.stringify(value)} bypasses a default initializer`, function () {
            assert.strictEqual(propertyIsDefined(value), expected);
        });
    }

    for (
        const content of [
            '{answer:1,answer:2}',
            '{answer}',
            '{...other}',
            '{[name]:42}',
            '{[name](){return 42;}}'
        ]
    ) {
        test(`rejects an ambiguous shape ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', `(${content});`);
            const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
            assert.strictEqual(objectReadShape(object, createSourceEvaluation(source).primitiveValue), undefined);
        });
    }

    for (
        const [ body, expected ] of [
            [ '{return;}', { getIsPure: true, value: { type: 'value', value: undefined } } ],
            [ '{}', { getIsPure: false, value: { type: 'unknown' } } ],
            [ '{perform();}', { getIsPure: false, value: { type: 'unknown' } } ],
            [ ';', { getIsPure: false, value: { type: 'unknown' } } ]
        ] as const
    ) {
        test(`preserves getter behavior for ${body}`, function () {
            const source = createProject().createSourceFile('input.ts', `({get answer()${body}});`);
            const object = source.getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
            const shape = objectReadShape(object, createSourceEvaluation(source).primitiveValue);
            assertDefined(shape);
            assert.strictEqual(shape.creationIsPure, true);
            assert.deepStrictEqual(shape.propertyRead('answer'), expected);
        });
    }
});
