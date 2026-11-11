import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
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

        test('retains remaining computation after 32 changing passes', function () {
            const content = 'export const result=1||2;';
            const preparation = createSourcePreparation(createProject().createSourceFile('input.js', content));
            let passes = 0;
            simplifyConstantControlFlow({
                ...preparation,
                applyEdits(edits) {
                    passes += 1;
                    assert.ok(passes <= 32);
                    preparation.applyEdits(edits);
                    preparation.applyEdits([ {
                        start: 0,
                        end: preparation.sourceFile.getFullText().length,
                        content: content + '\n'.repeat(passes)
                    } ]);
                }
            });
            assert.strictEqual(passes, 32);
            assert.strictEqual(preparation.sourceFile.getFullText(), content + '\n'.repeat(32));
        });
    });

    for (
        const [ content, expected ] of [
            [ 'export const result=1+2;', 'export const result=1+2;' ],
            [ 'export const result=unknown||2;', 'export const result=unknown||2;' ],
            [ 'export const result=true?1:2;', 'export const result=(1);' ],
            [ 'export const result=false?1:2;', 'export const result=(2);' ],
            [ 'export const result=true?1+1:3;', 'export const result=(2);' ],
            [ 'export const result=true?-1:3;', 'export const result=(-1);' ],
            [ 'export const result=true?1e4:3;', 'export const result=(0, 1e4);' ],
            [ 'export const result=true?unknown:3;', 'export const result=(0, unknown);' ],
            [ 'export const result=0||2;', 'export const result=(2);' ],
            [ 'export const result=1&&2;', 'export const result=(2);' ],
            [ 'export const result=1||2;', 'export const result=(1);' ],
            [ '1+1;', ';' ],
            [ 'if(false){let value=1;}else{effect();}', '{effect();}' ]
        ]
    ) {
        test(`selects constant control flow in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            simplifyConstantControlFlow(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), expected);
        });
    }

    test('preserves code visible to direct eval', function () {
        const content = 'let value=1;eval("value=2");if(false){consume(value);}export const result=value;';
        const source = createProject().createSourceFile('input.js', content);
        const preparation = createSourcePreparation(source);
        simplifyConstantControlFlow(preparation);
        assert.strictEqual(source.getFullText(), content);
        assert.deepStrictEqual(preparation.transformations, []);
    });
});
