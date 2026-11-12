import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';

suite('binding read effects', function () {
    for (
        const [ content, expected ] of [
            [ 'let value=opaque();const observed=value;', true ],
            [ 'const value=opaque();const observed=(value);', true ],
            [ 'let value;const observed=value;', true ],
            [ 'const observed=value;let value=opaque();', false ],
            [ 'declare const value:number;const observed=value;', false ],
            [ 'var value=opaque();const observed=value;', false ],
            [ 'function probe(value){const observed=value;}', true ],
            [ 'function probe(value){return()=>{const observed=value;};}', false ],
            [ 'probe();const value=opaque();function probe(){const observed=value;}', false ],
            [ 'function probe(value){with(object){const observed=value;}}', false ],
            [ 'const observed=missing;', false ],
            [
                'class Box{constructor(public value){Object.defineProperty(this,"value",{get(){effect();return 1;}});const observed=this.value;}}',
                false
            ]
        ] as const
    ) {
        test(`separates value knowledge from safe reads in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const declaration = source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find(function (candidate) {
                return candidate.getName() === 'observed';
            });
            assertDefined(declaration);
            const expression = declaration.getInitializerOrThrow();
            const evaluation = createSourceEvaluation(source);
            assert.strictEqual(evaluation.canDiscard(expression), expected);
            assert.strictEqual(evaluation.primitiveValue(expression), undefined);
        });
    }

    for (
        const [ content, parameterName, expected ] of [
            [ 'function probe(value=value){return 42;}', 'value', false ],
            [ 'function probe(first=value,value=42){return 42;}', 'first', false ],
            [ 'function probe(value,other=value){return 42;}', 'other', true ]
        ] as const
    ) {
        test(`preserves parameter initialization order in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const expression = source
                .getFunctionOrThrow('probe')
                .getParameterOrThrow(parameterName)
                .getInitializerOrThrow();
            assert.strictEqual(createSourceEvaluation(source).canDiscard(expression), expected);
        });
    }
});
