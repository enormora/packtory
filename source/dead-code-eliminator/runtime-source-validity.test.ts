import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { runtimeSourceIsValid } from './runtime-source-validity.ts';

suite('runtime source validity', function () {
    for (
        const [ filePath, content, expected ] of [
            [ 'index.js', 'export const value=42;', true ],
            [ 'index.js', 'const value=42;', true ],
            [ 'index.js', 'function duplicate(value,value){}', false ],
            [ 'index.js', 'return 42;', false ],
            [ 'index.cjs', 'return 42;', true ],
            [ 'index.cts', 'return 42;', true ],
            [ 'index.cjs', 'function duplicate(value,value){}', true ],
            [ 'index.cjs', 'export const value=42;', false ],
            [ 'index.cjs', '"use strict";function duplicate(value,value){}', false ],
            [ 'index.mjs', 'await Promise.resolve();', true ],
            [ 'index.mts', 'await Promise.resolve();', true ],
            [ 'index.js', 'await Promise.resolve();', false ],
            [ 'index.js', 'export {};function duplicate(value,value){}', false ],
            [ 'folder.cjs/index.js', 'return 42;', false ],
            [ 'index.ajs', 'return 42;', false ],
            [ 'index.cxs', 'return 42;', false ],
            [ 'index.js', 'const value:number=42;', false ],
            [ 'index.ts', 'const value:number=42;', true ],
            [ 'index.ts', '@decorate class Local{constructor(@argument value:unknown){}}', true ],
            [ 'index.ts', 'class Local{accessor value=42;}', true ],
            [ 'index.ts', 'namespace Scope{export const value=42;}', false ],
            [ 'index.ts', 'export namespace Scope{export const value=42;}', true ],
            [ 'index.ts', 'const view=<div/>;', false ],
            [ 'index.jsx', 'const view=<div/>;', true ],
            [ 'index.tsx', 'const view:unknown=<div/>;', true ],
            [ 'index.js', 'const value={__proto__:null,__proto__:null};', false ],
            [ 'index.js', 'const value={answer:1,answer:2};', true ],
            [ 'index.js', 'class Local{#value;#value;}', false ],
            [ 'index.js', 'class Local{get #value(){}set #value(next){}}', true ],
            [ 'index.js', 'using resource=null;export{};', true ],
            [ 'index.js', 'using resource=null;', true ],
            [ 'index.js', 'function incomplete(', false ]
        ] as const
    ) {
        test(`checks ${filePath}: ${content}`, function () {
            const source = createProject().createSourceFile(filePath, content);
            assert.strictEqual(runtimeSourceIsValid(source), expected);
        });
    }

    test('validates the current source after edits', function () {
        const source = createProject().createSourceFile('index.js', 'export const value=42;');
        assert.strictEqual(runtimeSourceIsValid(source), true);
        source.replaceWithText('export const value={__proto__:null,__proto__:null};');
        assert.strictEqual(runtimeSourceIsValid(source), false);
        source.replaceWithText('export const value=21;');
        assert.strictEqual(runtimeSourceIsValid(source), true);
    });
});
