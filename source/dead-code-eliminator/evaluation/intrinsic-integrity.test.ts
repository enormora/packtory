import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { establishEvaluationEnvironment } from './evaluation-environment-establishment.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';
import { intrinsicIntegrityOf, type IntrinsicIntegrity } from './evaluation-environment.ts';
import type { GlobalPath } from './global-path.ts';

const symbolConstructor: GlobalPath = [ 'Symbol' ];
const arrayIterator: GlobalPath = [ 'Array', 'prototype', '@@iterator' ];

function integrityOf(...contents: readonly string[]): IntrinsicIntegrity {
    const project = createProject();
    const sources = contents.map(function (content, index) {
        return project.createSourceFile(`/module-${index}.js`, content);
    });
    establishEvaluationEnvironment(sources, undefined, resolveRuntimeModule);
    return intrinsicIntegrityOf(sources[0] ?? project.createSourceFile('/empty.js', ''));
}

suite('intrinsic-integrity', function () {
    test('keeps intrinsics intact without writes', function () {
        const integrity = integrityOf('const key = Symbol("x"); const values = [ ...[ 1 ] ]; export { key, values };');

        assert.strictEqual(integrity.isIntact(symbolConstructor), true);
        assert.strictEqual(integrity.isIntact(arrayIterator), true);
    });

    suite('detected writes', function () {
        for (
            const write of [
                'Symbol = replacement;',
                'Symbol ??= replacement;',
                'globalThis.Symbol = replacement;',
                'global.Symbol = replacement;',
                'self.Symbol = replacement;',
                'window.Symbol = replacement;',
                'globalThis.globalThis.Symbol = replacement;',
                'globalThis["Symbol"] = replacement;',
                'const name = "Sym" + "bol"; globalThis[name] = replacement;',
                'const realm = globalThis; realm.Symbol = replacement;',
                'delete globalThis.Symbol;',
                'globalThis.Symbol++;',
                '--globalThis.Symbol;',
                '[ globalThis.Symbol ] = [ replacement ];',
                '({ value: globalThis.Symbol } = source);',
                '({ Symbol } = source);',
                '[ ...globalThis.Symbol ] = source;',
                '({ ...globalThis.Symbol } = source);',
                '[ globalThis.Symbol = fallback ] = source;',
                'for (globalThis.Symbol of sources) {}',
                'for (globalThis.Symbol in source) {}',
                'Object.defineProperty(globalThis, "Symbol", { value: replacement });',
                'Reflect.defineProperty(globalThis, "Symbol", { value: replacement });',
                'Reflect.set(globalThis, "Symbol", replacement);',
                'Reflect.deleteProperty(globalThis, "Symbol");',
                'Object.defineProperties(globalThis, { Symbol: { value: replacement } });',
                'Object.defineProperties(globalThis, { "Symbol": { value: replacement } });',
                'Object.defineProperties(globalThis, { ["Sym" + "bol"]: { value: replacement } });',
                'Object.assign(globalThis, { Symbol: replacement });',
                'Object.assign(globalThis, {}, { Symbol: replacement });',
                'Object.assign(globalThis, { Symbol });',
                'Object.assign(globalThis, { Symbol() {} });',
                'Object.setPrototypeOf(globalThis, replacement);',
                'Reflect.setPrototypeOf(globalThis, replacement);',
                'globalThis.__proto__ = replacement;',
                'eval(source);',
                '(0, eval)(source);',
                'globalThis.eval(source);',
                'Function(source)();',
                'new Function(source)();',
                'with (scope) {}'
            ]
        ) {
            test(`marks Symbol as patched by: ${write}`, function () {
                assert.strictEqual(integrityOf(`${write}\nexport {};`).isIntact(symbolConstructor), false);
            });
        }

        for (
            const write of [
                'Array.prototype[Symbol.iterator] = replacement;',
                'const proto = Array.prototype; proto[Symbol.iterator] = replacement;',
                'const key = Symbol.iterator; Array.prototype[key] = replacement;',
                'Object.defineProperty(Array.prototype, Symbol.iterator, { value: replacement });',
                'Object.assign(Array.prototype, { [Symbol.iterator]: replacement });',
                'Object.setPrototypeOf(Array.prototype, replacement);',
                'Array.prototype.__proto__ = replacement;',
                'globalThis.Array = replacement;',
                'Array = replacement;'
            ]
        ) {
            test(`marks the array iterator as patched by: ${write}`, function () {
                assert.strictEqual(integrityOf(`${write}\nexport {};`).isIntact(arrayIterator), false);
            });
        }

        for (
            const write of [
                'const Symbol = local; Symbol.description = "x";',
                'let Symbol; Symbol = replacement;',
                'globalThis[unknownName] = replacement;',
                'Object.defineProperty(globalThis, unknownName, { value: replacement });',
                'Object.defineProperty(globalThis);',
                'Object.defineProperty();',
                'Object.defineProperty(unknownTarget, "Symbol", { value: replacement });',
                'Object.assign(globalThis, unknownSource, { ...spread });',
                'Object.assign(unknownTarget, { Symbol: replacement });',
                'Object.defineProperties(globalThis, { [unknownName]: { value: replacement } });',
                'Object.setPrototypeOf(unknownTarget, replacement);',
                'Object.setPrototypeOf();',
                'Reflect.set(...writeArguments);',
                'Symbol.iterator = replacement;',
                'Array.prototype.custom = replacement;',
                'const Object = { assign() {} }; Object.assign(globalThis, { Symbol: replacement });',
                'compute(globalThis, "Symbol");',
                'unknownTarget().Symbol = replacement;',
                'let total = 0; total += 1; total++; !total;',
                'class Holder { #Symbol = 1; } Object.assign(globalThis, { 1: replacement, ["x"]: replacement });',
                'const pattern = [ unknownTarget().value ] = source;',
                'Object.assign();',
                'Object.assign(createTarget(), { Symbol: replacement });',
                'Object.assign(globalThis, { 1n: replacement });',
                '({ method() {} } = source);',
                'Symbol[unknownName] = replacement;',
                'Symbol.global = replacement;',
                '!Symbol;',
                'Array.prototype[Other.iterator] = replacement;',
                'Array.prototype[Symbol.iterator.description] = replacement;'
            ]
        ) {
            test(`keeps Symbol and the array iterator intact for: ${write}`, function () {
                const integrity = integrityOf(`${write}\nexport {};`);

                assert.strictEqual(integrity.isIntact(symbolConstructor), true);
                assert.strictEqual(integrity.isIntact(arrayIterator), true);
            });
        }
    });

    suite('bundle scope', function () {
        test('treats intrinsics as untrusted when no bundle integrity was established', function () {
            const reader = createProject().createSourceFile('/reader.js', 'export const key = Symbol("x");');

            assert.strictEqual(intrinsicIntegrityOf(reader).isIntact(symbolConstructor), false);
        });

        test('keeps the established bundle integrity instead of scanning files added later', function () {
            const project = createProject();
            const reader = project.createSourceFile('/reader.js', 'export const key = Symbol("x");');
            establishEvaluationEnvironment([ reader ], undefined, resolveRuntimeModule);
            project.createSourceFile('/external.js', 'globalThis.Symbol = replacement; export {};');

            assert.strictEqual(intrinsicIntegrityOf(reader).isIntact(symbolConstructor), true);
        });

        test('combines writes across all scanned modules of a bundle', function () {
            const integrity = integrityOf('export const value = 1;', 'globalThis.Symbol = replacement; export {};');

            assert.strictEqual(integrity.isIntact(symbolConstructor), false);
            assert.strictEqual(integrity.isIntact(arrayIterator), true);
        });

        test('does not mark a sibling path as patched', function () {
            const integrity = integrityOf('globalThis.Set.prototype.add = replacement; export {};');

            assert.strictEqual(integrity.isIntact([ 'Set', 'prototype', 'add' ]), false);
            assert.strictEqual(integrity.isIntact([ 'Set', 'prototype', 'has' ]), true);
            assert.strictEqual(integrity.isIntact([ 'Set' ]), true);
        });

        for (
            const { count, intact } of [
                { count: maximumEvaluationDepth - 2, intact: false },
                { count: maximumEvaluationDepth - 1, intact: true }
            ]
        ) {
            test(`follows ${count} aliases only within the evaluation depth`, function () {
                const aliases = Array.from({ length: count }, function (_value, index) {
                    return `const alias${index + 1} = alias${index};`;
                });
                const integrity = integrityOf(
                    `const alias0 = globalThis;${aliases.join('')}alias${count}.Symbol = replacement; export {};`
                );

                assert.strictEqual(integrity.isIntact(symbolConstructor), intact);
            });
        }
    });
});
