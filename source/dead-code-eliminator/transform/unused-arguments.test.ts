import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { removeUnusedArguments } from './unused-arguments.ts';

suite('unused argument proofs', function () {
    const effect = 'function effect(unused){console.log("effect");}';
    for (
        const [ description, path, source, expected ] of [
            [
                'a nested call',
                'index.js',
                `${effect}export const value=consume(effect(42));`,
                `${effect}export const value=consume(effect());`
            ],
            [
                'a used argument with a trailing comma',
                'index.js',
                'function effect(value){console.log(value);}export const value=effect(42,);',
                null
            ],
            [ 'a script call', 'index.cjs', `${effect}effect(42);`, null ],
            [
                'an inline function expression',
                'index.js',
                'export const value=(function(unused){console.log(1);})(42);',
                null
            ],
            [
                'an ambient declaration',
                'index.ts',
                'declare function effect(unused: number): void;export const value=effect(42);',
                null
            ],
            [
                'a rest parameter after an unused parameter',
                'index.js',
                'function effect(unused,...values){console.log(values.length);}export const value=effect(1,2,3);',
                null
            ],
            [
                'a spread followed by a fixed value',
                'index.js',
                `${effect}export const value=effect(...values,42);`,
                null
            ]
        ] as const
    ) {
        test(`rewrites only proven unused arguments for ${description}`, function () {
            const preparation = createSourcePreparation(createProject().createSourceFile(path, source));
            removeUnusedArguments({
                ...preparation,
                applyEdits(edits) {
                    assert.notDeepStrictEqual(edits, []);
                    preparation.applyEdits(edits);
                }
            }, function () {
                return false;
            });
            assert.strictEqual(preparation.sourceFile.getFullText(), expected ?? source);
        });
    }
});
