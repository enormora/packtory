import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../source-transformation/source-preparation.ts';
import { removeUnreachableStatements } from './transform/unreachable-statements.ts';

suite('unreachable initializer scope', function () {
    for (
        const declaration of [
            'var value=console.log("unreachable");',
            'let value=console.log("unreachable");',
            'const value=console.log("unreachable");',
            'var {value}=console.log("unreachable");',
            'let {value}=console.log("unreachable");',
            'const [value]=console.log("unreachable");'
        ]
    ) {
        test(`preserves returned closures for ${declaration}`, function () {
            const content = `function make(){return ()=>value;${declaration}}export function probe(){return make()();}`;
            const source = createProject().createSourceFile('index.js', content);
            removeUnreachableStatements(createSourcePreparation(source));
            const binding = declaration.startsWith('const')
                ? 'const value=void 0;'
                : `${declaration.slice(0, 3)} value;`;
            assert.strictEqual(
                source.getFullText(),
                `function make(){return ()=>value;${binding}}export function probe(){return make()();}`
            );
        });
    }

    test('preserves a parameter sharing an unreachable var binding', function () {
        const source = createProject().createSourceFile(
            'index.js',
            'function make(value){return ()=>value;var value=console.log("unreachable");}export function probe(){return make(42)();}'
        );
        removeUnreachableStatements(createSourcePreparation(source));
        assert.strictEqual(
            source.getFullText(),
            'function make(value){return ()=>value;var value;}export function probe(){return make(42)();}'
        );
    });
});
