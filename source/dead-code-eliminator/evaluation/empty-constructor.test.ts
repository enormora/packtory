import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { constructorBodyIsEmpty } from './empty-constructor.ts';

suite('constructor body proofs', function () {
    for (
        const [ content, expected ] of [
            [ 'function Empty(){}', true ],
            [ 'function Empty(value){{;}return;}', true ],
            [ 'declare function Empty():void;', false ],
            [ 'function Required(){return 42;}', false ],
            [ 'function Required(){;effect();}', false ],
            [ 'function Required(){{;effect();}}', false ],
            [ 'function Required(value=42){}', false ],
            [ 'function Required(...values){}', false ],
            [ 'function Required({value}){}', false ]
        ] as const
    ) {
        test(`checks function construction in ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const target = source.getFirstDescendantByKindOrThrow(SyntaxKind.FunctionDeclaration);
            assert.strictEqual(constructorBodyIsEmpty(target), expected);
        });
    }

    for (
        const [ parameters, expected ] of [
            [ '', true ],
            [ 'value:unknown', true ],
            [ 'public value:unknown', false ],
            [ '@decorate value:unknown', false ]
        ] as const
    ) {
        test(`checks class parameter effects for ${parameters}`, function () {
            const source = createProject().createSourceFile('input.ts', `class Local{constructor(${parameters}){}}`);
            const target = source.getFirstDescendantByKindOrThrow(SyntaxKind.Constructor);
            assert.strictEqual(constructorBodyIsEmpty(target), expected);
        });
    }
});
