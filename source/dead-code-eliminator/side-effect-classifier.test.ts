import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { classifySideEffects } from './side-effect-classifier.ts';

// cspell:ignore yoctocolors

function classify(
    content: string,
    settings?: DeadCodeEliminationSettings
): readonly { readonly line: number; readonly kind: string }[] {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    const result = classifySideEffects(project.getSourceFileOrThrow('index.ts'), settings);
    return result.map((statement) => {
        return { line: statement.line, kind: statement.kind };
    });
}

suite('side-effect-classifier', function () {
    test('reports nothing for an empty file', function () {
        assert.deepStrictEqual(classify(''), []);
    });

    test('treats a function declaration as pure', function () {
        assert.deepStrictEqual(classify('function foo() { return 1; }'), []);
    });

    test('treats a class declaration without decorators as pure', function () {
        assert.deepStrictEqual(classify('class Foo { method() { return 1; } }'), []);
    });

    test('treats an interface declaration as pure', function () {
        assert.deepStrictEqual(classify('interface Foo { x: number; }'), []);
    });

    test('treats a type alias as pure', function () {
        assert.deepStrictEqual(classify('type Foo = string;'), []);
    });

    test('treats an enum declaration as pure', function () {
        assert.deepStrictEqual(classify('enum Foo { A, B }'), []);
    });

    test('treats a const enum declaration as pure', function () {
        assert.deepStrictEqual(classify('const enum Foo { A = 1 }'), []);
    });

    test('treats a namespace declaration as pure', function () {
        assert.deepStrictEqual(classify('namespace Foo { export const x: number = 1; }'), []);
    });

    test('treats an empty statement as pure', function () {
        assert.deepStrictEqual(classify(';'), []);
    });

    test('treats a re-export as pure', function () {
        assert.deepStrictEqual(classify('export { foo } from "./other";'), []);
    });

    test('treats a star re-export as pure', function () {
        assert.deepStrictEqual(classify('export * from "./other";'), []);
    });

    test('treats a regular ESM import as pure', function () {
        assert.deepStrictEqual(classify('import { foo } from "./other";'), []);
    });

    test('treats a default import as pure', function () {
        assert.deepStrictEqual(classify('import foo from "./other";'), []);
    });

    test('treats a namespace import as pure', function () {
        assert.deepStrictEqual(classify('import * as foo from "./other";'), []);
    });

    test('treats a bare import of a JS module as pure', function () {
        assert.deepStrictEqual(classify('import "./other";'), []);
    });

    test('flags a bare import of a CSS module as impure', function () {
        assert.deepStrictEqual(classify('import "./styles.css";'), [{ line: 1, kind: 'css import' }]);
    });

    test('treats a top-level call as an impure expression statement', function () {
        assert.deepStrictEqual(classify('console.log("hi");'), [{ line: 1, kind: 'expression statement' }]);
    });

    test('treats a top-level IIFE as an impure expression statement', function () {
        assert.deepStrictEqual(classify('(function() { return 1; })();'), [{ line: 1, kind: 'expression statement' }]);
    });

    test('treats a top-level if statement as impure', function () {
        assert.deepStrictEqual(classify('if (true) { console.log(1); }'), [{ line: 1, kind: 'if statement' }]);
    });

    test('treats a top-level for statement as impure', function () {
        assert.deepStrictEqual(classify('for (let i = 0; i < 1; i++) { console.log(i); }'), [
            { line: 1, kind: 'for statement' }
        ]);
    });

    test('treats a top-level for-in statement as impure', function () {
        assert.deepStrictEqual(classify('for (const k in {}) { console.log(k); }'), [
            { line: 1, kind: 'for-in statement' }
        ]);
    });

    test('treats a top-level for-of statement as impure', function () {
        assert.deepStrictEqual(classify('for (const v of []) { console.log(v); }'), [
            { line: 1, kind: 'for-of statement' }
        ]);
    });

    test('treats a top-level while statement as impure', function () {
        assert.deepStrictEqual(classify('while (false) { break; }'), [{ line: 1, kind: 'while statement' }]);
    });

    test('treats a top-level do-while statement as impure', function () {
        assert.deepStrictEqual(classify('do { break; } while (false);'), [{ line: 1, kind: 'do-while statement' }]);
    });

    test('treats a top-level switch statement as impure', function () {
        assert.deepStrictEqual(classify('switch (1) { case 1: break; }'), [{ line: 1, kind: 'switch statement' }]);
    });

    test('treats a top-level try statement as impure', function () {
        assert.deepStrictEqual(classify('try { } catch (e) { }'), [{ line: 1, kind: 'try statement' }]);
    });

    test('treats a top-level throw statement as impure', function () {
        assert.deepStrictEqual(classify('throw new Error("oops");'), [{ line: 1, kind: 'throw statement' }]);
    });

    test('treats a labeled statement as impure', function () {
        assert.deepStrictEqual(classify('outer: { console.log(1); }'), [{ line: 1, kind: 'labeled statement' }]);
    });

    test('treats a top-level block statement as impure', function () {
        assert.deepStrictEqual(classify('{ const x = 1; }'), [{ line: 1, kind: 'block statement' }]);
    });

    test('treats a const with a literal initializer as pure', function () {
        assert.deepStrictEqual(classify('const x = 1;'), []);
    });

    test('treats a const with a string initializer as pure', function () {
        assert.deepStrictEqual(classify('const x = "hello";'), []);
    });

    test('treats a const with a template literal of pure interpolations as pure', function () {
        // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
        assert.deepStrictEqual(classify('const x = `hello ${1 + 2}`;'), []);
    });

    test('treats a const with a template literal containing a call as impure', function () {
        // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
        assert.deepStrictEqual(classify('const x = `hello ${compute()}`;'), [
            { line: 1, kind: 'variable initializer' }
        ]);
    });

    test('treats a const with a template literal mixing pure and impure spans as impure', function () {
        // eslint-disable-next-line no-template-curly-in-string -- template literal embedded in source-under-test
        assert.deepStrictEqual(classify('const x = `pure ${1} mixed ${compute()}`;'), [
            { line: 1, kind: 'variable initializer' }
        ]);
    });

    test('treats a const with a function expression as pure', function () {
        assert.deepStrictEqual(classify('const x = function () { return 1; };'), []);
    });

    test('treats a const with an arrow function as pure', function () {
        assert.deepStrictEqual(classify('const x = () => 1;'), []);
    });

    test('treats a const with a class expression as pure', function () {
        assert.deepStrictEqual(classify('const x = class { method() {} };'), []);
    });

    test('treats a const with an array literal of pure values as pure', function () {
        assert.deepStrictEqual(classify('const x = [1, 2, "three", () => 4];'), []);
    });

    test('treats a const with a sparse array literal as pure', function () {
        assert.deepStrictEqual(classify('const x = [1, , 3];'), []);
    });

    test('treats a const with an array literal containing a call as impure', function () {
        assert.deepStrictEqual(classify('const x = [compute()];'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with an array literal mixing pure and impure elements as impure', function () {
        assert.deepStrictEqual(classify('const x = [1, compute()];'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with a spread of an array literal as pure', function () {
        assert.deepStrictEqual(classify('const x = [...[1, 2]];'), []);
    });

    test('treats a const with a spread of a call expression as impure', function () {
        assert.deepStrictEqual(classify('const x = [...compute()];'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with an object literal of pure properties as pure', function () {
        assert.deepStrictEqual(classify('const x = { a: 1, b: "two", c: () => 3 };'), []);
    });

    test('treats a const with an object literal whose value is a call as impure', function () {
        assert.deepStrictEqual(classify('const x = { a: compute() };'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with an object literal mixing pure and impure properties as impure', function () {
        assert.deepStrictEqual(classify('const x = { a: 1, b: compute() };'), [
            { line: 1, kind: 'variable initializer' }
        ]);
    });

    test('treats a const with an object spread of a pure literal as pure', function () {
        assert.deepStrictEqual(classify('const x = { ...{ a: 1 } };'), []);
    });

    test('treats a const with an object shorthand reference as pure', function () {
        assert.deepStrictEqual(classify('const a = 1; const x = { a };'), []);
    });

    test('treats a const with an object method as pure', function () {
        assert.deepStrictEqual(classify('const x = { method() { return 1; } };'), []);
    });

    test('treats a const with an object getter as pure', function () {
        assert.deepStrictEqual(classify('const x = { get prop() { return 1; } };'), []);
    });

    test('treats a const with an "as" cast wrapping a pure expression as pure', function () {
        assert.deepStrictEqual(classify('const x = 1 as number;'), []);
    });

    test('treats a const with a "satisfies" wrapping a pure expression as pure', function () {
        assert.deepStrictEqual(classify('const x = 1 satisfies number;'), []);
    });

    test('treats a const with a legacy angle-bracket type assertion of a pure expression as pure', function () {
        assert.deepStrictEqual(classify('const x = <number>1;'), []);
    });

    test('treats a const with a parenthesized pure expression as pure', function () {
        assert.deepStrictEqual(classify('const x = (1 + 2);'), []);
    });

    test('treats a const with a non-null assertion of a pure expression as pure', function () {
        assert.deepStrictEqual(classify('const a = 1; const x = a!;'), []);
    });

    test('treats a const with a unary minus on a pure operand as pure', function () {
        assert.deepStrictEqual(classify('const x = -5;'), []);
    });

    test('treats a const with a logical not on a pure operand as pure', function () {
        assert.deepStrictEqual(classify('const x = !false;'), []);
    });

    test('treats a const with an unsupported prefix unary operator as impure', function () {
        assert.deepStrictEqual(classify('let a = 1; const x = ++a;'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with an arithmetic binary expression of pure operands as pure', function () {
        assert.deepStrictEqual(classify('const x = 1 + 2 * 3;'), []);
    });

    test('treats a const with a logical binary of pure operands as pure', function () {
        assert.deepStrictEqual(classify('const x = true && false;'), []);
    });

    test('treats a const with a strict equality binary as pure', function () {
        assert.deepStrictEqual(classify('const x = 1 === 1;'), []);
    });

    test('treats a const with a loose equality binary as impure', function () {
        assert.deepStrictEqual(classify('const x = 1 == 1;'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with a binary expression containing a call as impure', function () {
        assert.deepStrictEqual(classify('const x = 1 + compute();'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with an identifier reference as pure', function () {
        assert.deepStrictEqual(classify('const a = 1; const x = a;'), []);
    });

    test('treats a const with a property access as impure', function () {
        assert.deepStrictEqual(classify('declare const obj: { x: number }; const x = obj.x;'), [
            { line: 1, kind: 'variable initializer' }
        ]);
    });

    test('treats a const with a call expression as impure', function () {
        assert.deepStrictEqual(classify('const x = compute();'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with a Symbol call as pure', function () {
        assert.deepStrictEqual(classify('const x = Symbol("marker");'), []);
    });

    test('treats a const with a trusted imported call as pure', function () {
        assert.deepStrictEqual(
            classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors', imports: ['bold'] }]
            }),
            []
        );
    });

    test('treats a const with a wrapped trusted imported call and spread arguments as pure', function () {
        assert.deepStrictEqual(
            classify('import { bold } from "yoctocolors"; const x = (((bold as typeof bold))!)(...[\'hi\']);', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors', imports: ['bold'] }]
            }),
            []
        );
    });

    test('treats a const with a trusted namespace import call as pure', function () {
        assert.deepStrictEqual(
            classify('import * as colors from "yoctocolors"; const x = colors.green("hi");', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors' }]
            }),
            []
        );
    });

    test('treats a const with a trusted namespace import call as pure when the allow-list names the accessed member', function () {
        assert.deepStrictEqual(
            classify('import * as colors from "yoctocolors"; const x = colors.green("hi");', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors', imports: ['green'] }]
            }),
            []
        );
    });

    test('treats a namespace import call chain as impure when only a later accessed member is trusted', function () {
        assert.deepStrictEqual(
            classify('import * as colors from "yoctocolors"; const x = colors.bold.green("hi");', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors', imports: ['green'] }]
            }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a const with a trusted default import call as pure', function () {
        assert.deepStrictEqual(
            classify('import format from "trusted-formatter"; const x = format("hi");', {
                enabled: true,
                pureImports: [{ from: 'trusted-formatter', imports: ['default'] }]
            }),
            []
        );
    });

    test('treats a const with a named import as impure when only default imports are trusted', function () {
        assert.deepStrictEqual(
            classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors', imports: ['default'] }]
            }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a const with a trusted imported call as pure when a later trust rule matches', function () {
        assert.deepStrictEqual(
            classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                enabled: true,
                pureImports: [{ from: 'trusted-formatter' }, { from: 'yoctocolors', imports: ['bold'] }]
            }),
            []
        );
    });

    test('treats a const with a trusted namespace builder call chain as pure', function () {
        assert.deepStrictEqual(
            classify('import { z } from "zod/mini"; const x = z.string().check(z.minLength(1));', {
                enabled: true,
                pureImports: [{ from: 'zod/mini' }]
            }),
            []
        );
    });

    test('treats an untrusted imported call as impure', function () {
        assert.deepStrictEqual(
            classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors', imports: ['green'] }]
            }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a namespace import call as impure when the module is not trusted', function () {
        assert.deepStrictEqual(
            classify('import * as colors from "yoctocolors"; const x = colors.green("hi");', {
                enabled: true,
                pureImports: [{ from: 'trusted-formatter' }]
            }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a const with an imported call as impure when no pure import settings are configured', function () {
        assert.deepStrictEqual(
            classify('import { bold } from "yoctocolors"; const x = bold("hi");', { enabled: true }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a const with an imported call as impure when purity settings are omitted entirely', function () {
        assert.deepStrictEqual(classify('import { bold } from "yoctocolors"; const x = bold("hi");'), [
            { line: 1, kind: 'variable initializer' }
        ]);
    });

    test('treats a trusted imported call with an impure argument as impure', function () {
        assert.deepStrictEqual(
            classify('import { bold } from "yoctocolors"; const x = bold(compute());', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors', imports: ['bold'] }]
            }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a call through an untrusted property base as impure', function () {
        assert.deepStrictEqual(
            classify('declare const obj: { format(value: string): string }; const x = obj.format("hi");'),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a call through an unsupported imported element access as impure', function () {
        assert.deepStrictEqual(
            classify('import * as colors from "yoctocolors"; const x = colors["green"]("hi");', {
                enabled: true,
                pureImports: [{ from: 'yoctocolors' }]
            }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a const with a default import as impure when only namespace members are trusted', function () {
        assert.deepStrictEqual(
            classify('import format from "trusted-formatter"; const x = format("hi");', {
                enabled: true,
                pureImports: [{ from: 'trusted-formatter', imports: ['green'] }]
            }),
            [{ line: 1, kind: 'variable initializer' }]
        );
    });

    test('treats a const with a new expression as impure', function () {
        assert.deepStrictEqual(classify('const x = new Date();'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a const with a trusted constructor call as pure', function () {
        assert.deepStrictEqual(
            classify('const x = new Set([1, 2, 3]);', {
                enabled: true,
                pureConstructors: ['Set']
            }),
            []
        );
    });

    test('treats a constructor call as impure when constructor trust settings are omitted', function () {
        assert.deepStrictEqual(classify('const x = new Set([1, 2, 3]);', { enabled: true }), [
            { line: 1, kind: 'variable initializer' }
        ]);
    });

    test('treats multiple variable declarators as impure if any initializer is impure', function () {
        assert.deepStrictEqual(classify('const a = 1, b = compute();'), [{ line: 1, kind: 'variable initializer' }]);
    });

    test('treats a class with a method decorator as impure', function () {
        assert.deepStrictEqual(classify('function dec() { return () => {}; }\nclass Foo { @dec method() {} }'), [
            { line: 2, kind: 'class declaration' }
        ]);
    });

    test('treats a class with a class decorator as impure', function () {
        assert.deepStrictEqual(classify('function dec() { return () => {}; }\n@dec\nclass Foo {}'), [
            { line: 2, kind: 'class declaration' }
        ]);
    });

    test('treats a class with a static block as impure', function () {
        assert.deepStrictEqual(classify('class Foo { static { console.log("init"); } }'), [
            { line: 1, kind: 'class declaration' }
        ]);
    });

    test('treats a class with an impure static initializer as impure', function () {
        assert.deepStrictEqual(classify('class Foo { static x = compute(); }'), [
            { line: 1, kind: 'class declaration' }
        ]);
    });

    test('treats a class with a decorated set accessor as impure', function () {
        assert.deepStrictEqual(
            classify('function dec() { return () => {}; }\nclass Foo { @dec set value(v: number) {} }'),
            [{ line: 2, kind: 'class declaration' }]
        );
    });

    test('does not flag a class whose only members are constructors', function () {
        assert.deepStrictEqual(classify('class Foo { constructor() {} }'), []);
    });

    test('treats a top-level debugger statement as an impure unknown statement', function () {
        assert.deepStrictEqual(classify('debugger;'), [{ line: 1, kind: 'unknown statement' }]);
    });

    test('treats a class with a pure static initializer as pure', function () {
        assert.deepStrictEqual(classify('class Foo { static x = 1; }'), []);
    });

    test('treats a class with a static property without an initializer as pure', function () {
        assert.deepStrictEqual(classify('class Foo { static x: number; }'), []);
    });

    test('treats a class with a non-static impure initializer as pure (set per-instance)', function () {
        assert.deepStrictEqual(classify('class Foo { x = compute(); }'), []);
    });

    test('treats an export default class declaration as pure', function () {
        assert.deepStrictEqual(classify('export default class Foo {}'), []);
    });

    test('treats an export default function declaration as pure', function () {
        assert.deepStrictEqual(classify('export default function foo() {}'), []);
    });

    test('treats an export default of a pure expression as pure', function () {
        assert.deepStrictEqual(classify('export default 42;'), []);
    });

    test('treats an export default of a call expression as impure', function () {
        assert.deepStrictEqual(classify('declare function compute(): number; export default compute();'), [
            { line: 1, kind: 'export assignment' }
        ]);
    });

    test('treats an export-equals of a pure identifier as pure', function () {
        assert.deepStrictEqual(classify('declare const value: number; export = value;'), []);
    });

    test('treats an export-equals of a call as impure', function () {
        assert.deepStrictEqual(classify('declare function compute(): number; export = compute();'), [
            { line: 1, kind: 'export assignment' }
        ]);
    });

    test('reports the line of every impure statement', function () {
        const content = ['const a = 1;', 'console.log(a);', 'function foo() {}', 'compute();'].join('\n');
        assert.deepStrictEqual(classify(content), [
            { line: 2, kind: 'expression statement' },
            { line: 4, kind: 'expression statement' }
        ]);
    });

    test('treats ambient declare statements as pure', function () {
        assert.deepStrictEqual(
            classify(['declare const x: number;', 'declare function foo(): void;', 'declare class Bar {}'].join('\n')),
            []
        );
    });

    test('treats top-level await as impure (parsed inside an expression statement)', function () {
        const content = ['async function main() {', '  await Promise.resolve();', '}'].join('\n');
        assert.deepStrictEqual(classify(content), []);
    });

    test('treats a const with an await initializer as impure', function () {
        const content = 'const x = await Promise.resolve(1);';
        assert.deepStrictEqual(classify(content), [{ line: 1, kind: 'variable initializer' }]);
    });
});
