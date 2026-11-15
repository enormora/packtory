import assert from 'node:assert';
import { suite, test } from 'mocha';
import { initializerFromProjectFiles, variableInitializer } from '../pure-expression-test-support.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';

suite('local construction evaluation', function () {
    for (
        const [ expression, expected ] of [
            [ 'typeof new Empty()', 'object' ],
            [ '!new Empty()', false ],
            [ '!!new Empty()', true ],
            [ 'new Empty() === new Empty()', false ],
            [ 'new Empty() !== new Empty()', true ]
        ] as const
    ) {
        test(`evaluates ${expression}`, function () {
            const initializer = variableInitializer(`class Empty{};const result=${expression};export {};`, 'result');
            assert.deepStrictEqual(createSourceEvaluation(initializer.getSourceFile()).primitiveValue(initializer), {
                value: expected
            });
        });
    }

    test('keeps instance properties unknown instead of assuming an empty prototype', function () {
        const initializer = variableInitializer(
            'class Empty{get value(){return 42;}}const result=new Empty().value;export {};',
            'result'
        );
        assert.strictEqual(createSourceEvaluation(initializer.getSourceFile()).primitiveValue(initializer), undefined);
    });

    test('evaluates computed names before static initializers', function () {
        const initializer = variableInitializer(
            'function compute(){let x=0;new(class{static first=x=1;[x*=2](){}});return x;}const result=compute();export {};',
            'result'
        );
        assert.deepStrictEqual(createSourceEvaluation(initializer.getSourceFile()).primitiveValue(initializer), {
            value: 1
        });
    });

    test('does not model an instance as a primitive value', function () {
        const initializer = variableInitializer('class Empty{}const result=new Empty();export {};', 'result');
        const evaluation = createSourceEvaluation(initializer.getSourceFile());
        assert.strictEqual(evaluation.primitiveValue(initializer), undefined);
        assert.strictEqual(evaluation.canDiscard(initializer), true);
    });

    for (
        const content of [
            'class Empty{}const result=new Empty();',
            'declare class Empty{}const result=new Empty();export {};',
            'let Empty=class{};const result=new Empty();export {};',
            'class Empty{value=1;}const result=new Empty();export {};',
            'class Empty{}const result=new Empty(...[]);export {};',
            'class Empty{}const result=new Empty().missing;export {};',
            'const holder={Empty:class{}};const result=new holder.Empty();export {};',
            'const Empty=Empty;const result=new Empty();export {};',
            'const result=create();class Empty{}function create(){return new Empty();}export {};'
        ]
    ) {
        test(`retains an unproved construction in ${content}`, function () {
            const initializer = variableInitializer(content, 'result');
            assert.strictEqual(createSourceEvaluation(initializer.getSourceFile()).canDiscard(initializer), false);
        });
    }

    test('proves empty explicit construction without serializing the instance', function () {
        const initializer = variableInitializer(
            'class Empty{constructor(){}}const result=new Empty();export {};',
            'result'
        );
        const evaluation = createSourceEvaluation(initializer.getSourceFile());
        assert.strictEqual(evaluation.canDiscard(initializer), true);
        assert.strictEqual(evaluation.primitiveValue(initializer), undefined);
    });

    test('does not infer runtime constructors from another script file', function () {
        const initializer = initializerFromProjectFiles([
            { filePath: '/project/source/index.ts', content: 'const schema=new Empty();' },
            { filePath: '/project/source/other.ts', content: 'class Empty{}' }
        ]);
        assert.strictEqual(createSourceEvaluation(initializer.getSourceFile()).canDiscard(initializer), false);
    });

    test('preserves constructions after the evaluation depth budget is exhausted', function () {
        const nested = `${'new Empty('.repeat(40)}0${')'.repeat(40)}`;
        const initializer = variableInitializer(`class Empty{}const result=${nested};export {};`, 'result');
        assert.strictEqual(createSourceEvaluation(initializer.getSourceFile()).canDiscard(initializer), false);
    });
});
