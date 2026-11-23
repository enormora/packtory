import assert from 'node:assert';
import { runInNewContext } from 'node:vm';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { simplifyConstantControlFlow } from './constant-control-flow.ts';

suite('constant control flow', function () {
    suite('preparation limits', function () {
        test('does not apply empty edits', function () {
            const content = 'export const result=1;';
            const preparation = createSourcePreparation(createProject().createSourceFile('input.js', content));
            simplifyConstantControlFlow({
                ...preparation,
                applyEdits() {
                    assert.fail('stable control flow must not apply empty edits');
                }
            });
            assert.strictEqual(preparation.sourceFile.getFullText(), content);
        });

        for (const depth of [ 1, 32, 64 ]) {
            test(`reduces ${depth} nested constant branches`, function () {
                const content = `export function result(){${'if(true){'.repeat(depth)}return 42;${
                    '}else{unreachable();}'.repeat(depth)
                }}`;
                const source = createProject().createSourceFile('input.js', content);
                simplifyConstantControlFlow(createSourcePreparation(source));
                assert.deepStrictEqual(source.getDescendantsOfKind(SyntaxKind.IfStatement), []);
                assert.deepStrictEqual(source.getDescendantsOfKind(SyntaxKind.CallExpression), []);
                assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getText(), 'return 42;');
            });
        }
    });

    for (
        const [ content, expected ] of [
            [ 'export const result=1+2;', 'export const result=1+2;' ],
            [ 'export const result=unknown||2;', 'export const result=unknown||2;' ],
            [ 'export const result=unknown?1:2;', 'export const result=unknown?1:2;' ],
            [ '"use strict";', '"use strict";' ],
            [ 'if(unknown){effect();}', 'if(unknown){effect();}' ],
            [ 'if(42){}', ';' ],
            [ 'if(effect()){}', 'void (effect());' ],
            [ 'if(effect());else{{;}}', 'void (effect());' ],
            [ 'if(unknown){}else{effect();}', 'if(unknown){}else{effect();}' ],
            [ 'if(false){var value=1;}export {value};', 'if(false){var value=1;}export {value};' ],
            [ 'if(false){function value(){}}export {};', 'if(false){function value(){}}export {};' ],
            [ 'if(true){effect();}else{var value=1;}', 'if(true){effect();}else{var value=1;}' ],
            [ 'if(true)effect();', '{ effect(); }' ],
            [ 'if(false)effect();', ';' ],
            [ 'export const result=true?1:2;', 'export const result=(1);' ],
            [ 'export const result=false?1:2;', 'export const result=(2);' ],
            [ 'export const result=true?1+1:3;', 'export const result=(2);' ],
            [ 'export const result=true?-1:3;', 'export const result=(-1);' ],
            [ 'export const result=true?1e4:3;', 'export const result=(0, 1e4);' ],
            [ 'export const result=true?unknown:3;', 'export const result=(0, unknown);' ],
            [ 'export const result=0||2;', 'export const result=(2);' ],
            [ 'export const result=1&&2;', 'export const result=(2);' ],
            [ 'export const result=1||2;', 'export const result=(1);' ],
            [ 'export const result={} ? 1 : 2;', 'export const result=(1);' ],
            [ 'export const result=({})&&2;', 'export const result=(2);' ],
            [ 'export const result=({})||2;', 'export const result=(0, ({}));' ],
            [ 'export const result=({})??2;', 'export const result=(0, ({}));' ],
            [ 'class Empty{}export const result=new Empty()?1:2;', 'class Empty{}export const result=(1);' ],
            [ 'export const result=new class {}?1:2;', 'export const result=(1);' ],
            [ 'export const result={value:missing}?1:2;', 'export const result=({value:missing}, (1));' ],
            [ 'if({}){effect();}else{unreachable();}', '{effect();}' ],
            [ '1+1;', ';' ],
            [ 'do{}while(false);', ';' ],
            [ 'do;while(false);', ';' ],
            [ 'do{{;;}}while(false);', ';' ],
            [ 'do{;effect();}while(false);', 'do{;effect();}while(false);' ],
            [ 'do{}while(true);', 'do{}while(true);' ],
            [ 'do{}while(missing);', 'do{}while(missing);' ],
            [
                'export const result={__proto__:null,__proto__:null}?1:2;',
                'export const result={__proto__:null,__proto__:null}?1:2;'
            ],
            [ 'if(false){let value=1;}else{effect();}', '{effect();}' ]
        ]
    ) {
        test(`selects constant control flow in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            simplifyConstantControlFlow(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), expected);
        });
    }

    for (const condition of [ true, false ]) {
        test(`preserves condition effects before selecting the ${condition} branch`, function () {
            const source = createProject().createSourceFile(
                'input.js',
                `if((effect(),${condition}))selected();else rejected();`
            );
            simplifyConstantControlFlow(createSourcePreparation(source));
            const calls: string[] = [];
            runInNewContext(source.getFullText(), {
                effect() {
                    calls.push('condition');
                },
                selected() {
                    calls.push('selected');
                },
                rejected() {
                    calls.push('rejected');
                }
            });
            assert.deepStrictEqual(calls, [ 'condition', condition ? 'selected' : 'rejected' ]);
            assert.deepStrictEqual(source.getDescendantsOfKind(SyntaxKind.IfStatement), []);
        });
    }

    test('keeps the original location of repeated code in nested selected branches', function () {
        const source = createProject().createSourceFile(
            'input.js',
            [
                'if(false){',
                'marker();',
                '}else{',
                'if(true){',
                'marker();',
                '}else{',
                'marker();',
                '}',
                '}'
            ]
                .join('\n')
        );
        const preparation = createSourcePreparation(source);
        simplifyConstantControlFlow(preparation);
        const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
        assert.strictEqual(calls.length, 1);
        const [ retained ] = calls;
        assertDefined(retained);
        assert.strictEqual(preparation.originalLineFor(retained), 5);
    });

    test('preserves code visible to direct eval', function () {
        const content = 'let value=1;eval("value=2");if(false){consume(value);}export const result=value;';
        const source = createProject().createSourceFile('input.js', content);
        const preparation = createSourcePreparation(source);
        simplifyConstantControlFlow(preparation);
        assert.strictEqual(source.getFullText(), content);
        assert.deepStrictEqual(preparation.transformations, []);
    });
});
