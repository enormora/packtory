import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile } from 'ts-morph';
import { eliminateCodeModules, eliminateEntryModule } from '../test-libraries/eliminator-test-support.ts';
import { isPureExpression } from '../test-libraries/expression-purity-test-support.ts';
import { withSource } from '../test-libraries/transform-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';
import { createUnusedValueResolver } from './evaluation/unused-value-effects.ts';

function assertDiscardProof(content: string, discardable: boolean): void {
    const source = withSource(content);
    const expression = source.getVariableDeclarationOrThrow('unused').getInitializerOrThrow();
    assert.strictEqual(isPureExpression(expression, undefined), discardable);
    const resolveUnused = createUnusedValueResolver(source, function (candidate) {
        return isPureExpression(candidate, undefined);
    });
    assert.deepStrictEqual(resolveUnused(expression), discardable ? [] : undefined);
}

function assertPublicValue(source: SourceFile): void {
    assert.deepStrictEqual(
        source.getExportSymbols().map(function (symbol) {
            return symbol.getName();
        }),
        [ 'value' ]
    );
    assert.deepStrictEqual(
        createSourceEvaluation(source).primitiveValue(
            source.getVariableDeclarationOrThrow('value').getInitializerOrThrow()
        ),
        { value: 42 }
    );
}

suite('eliminator computed key effects', function () {
    test('removes a directly computed BigInt key', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'const unused={[9007199254740993n]:1};export const value=42;'
            )
        );
        assert.strictEqual(source.getVariableDeclaration('unused'), undefined);
        assertPublicValue(source);
    });

    test('removes unused primitive-key aliases through the DCE pipeline', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'const key=1n;const alias=key;const unused={[alias]:1};export const value=42;'
            )
        );
        assert.deepStrictEqual(
            source.getVariableDeclarations().map(function (declaration) {
                return declaration.getName();
            }),
            [ 'value' ]
        );
        assertPublicValue(source);
    });

    test('retains computed-key coercion when the object value is unused', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'const key={toString(){events.push("key");return "x";}};const unused={[key]:1};export const value=42;'
            )
        );
        assert.deepStrictEqual(
            source.getDescendantsOfKind(SyntaxKind.ComputedPropertyName).map(function (name) {
                return name.getExpression().getText();
            }),
            [ 'key' ]
        );
        assert.deepStrictEqual(
            source.getDescendantsOfKind(SyntaxKind.CallExpression).map(function (call) {
                return call.getText();
            }),
            [ 'events.push("key")' ]
        );
        assertPublicValue(source);
    });

    const cases = [ {
        name: 'toString effects',
        key: '{ toString() { events.push("key"); return "x"; } }'
    }, {
        name: 'valueOf fallback effects',
        key: '{ toString() { events.push("string"); return {}; }, valueOf() { events.push("value"); return 1; } }'
    }, {
        name: 'Symbol.toPrimitive effects and the string hint',
        key: '{ [Symbol.toPrimitive](hint) { events.push(hint); return Symbol(); } }'
    }, {
        name: 'throwing coercion',
        key: '{ toString() { throw new Error("coercion failed"); } }'
    }, {
        name: 'coercion of a Symbol description',
        key: 'Symbol({ toString() { events.push("description"); return "x"; } })'
    }, {
        name: 'array coercion',
        key: '[{ toString() { events.push("element"); return "x"; } }]'
    }, {
        name: 'callable coercion',
        key: 'function () {}'
    } ];
    for (const scenario of cases) {
        for (const member of [ '[key]: 1', '[key]() {}', 'get [key]() {}', 'set [key](value) {}' ]) {
            test(`preserves ${scenario.name} in ${member}`, function () {
                const content = [
                    `const key = ${scenario.key};`,
                    ...scenario.name === 'callable coercion'
                        ? [ 'key.toString = () => { events.push("function"); return "x"; };' ]
                        : [],
                    `const unused = { ${member} };`,
                    'export const value = 42;'
                ]
                    .join('\n');
                assertDiscardProof(content, false);
            });
        }
    }
    for (
        const key of [
            '"x"',
            '1',
            '1n',
            'true',
            'false',
            'null',
            'undefined',
            '`x`',
            '(() => "x")()',
            '((n) => { if(n < 0) events.push("never"); return n; })(1)',
            '(() => { let n=0; for(let i=0;i<3;i++)n+=i; return n; })()'
        ]
    ) {
        test(`removes an unused object with primitive key ${key}`, function () {
            assertDiscardProof(
                `const key = ${key}; const alias = key; const unused = { [alias]: 1 }; export const value = 42;`,
                true
            );
        });
    }

    suite('Symbol replacement effects', function () {
        const replacement = '()=>{events.push("call");return {toString(){events.push("coerce");return "x";}};}';
        const changes = [
            { name: 'global alias', code: `const realm=globalThis;realm.Symbol=${replacement};` },
            { name: 'Reflect.set', code: `Reflect.set(globalThis,"Symbol",${replacement});` },
            { name: 'direct assignment', code: `globalThis.Symbol=${replacement};` },
            { name: 'property definition', code: `Object.defineProperty(globalThis,"Symbol",{value:${replacement}});` },
            {
                name: 'global getter',
                code: `Object.defineProperty(globalThis,"Symbol",{get(){events.push("read");return ${replacement};}});`
            }
        ];
        const operations = [
            'const unused=Symbol("x");',
            'const unused={[Symbol("x")]:1};',
            'const unused={[Symbol("x")](){}};',
            'const unused={get [Symbol("x")](){}};',
            'const key=Symbol("x");const alias=key;const unused={[alias]:1};'
        ];
        for (const change of changes) {
            for (const operation of operations) {
                test(`preserves Symbol effects through ${change.name} for ${operation}`, function () {
                    assertDiscardProof(`${change.code}${operation}export const value=42;`, false);
                });
            }
        }

        test('preserves replacement effects from another module', async function () {
            const emitted = await eliminateCodeModules(
                'import "./replacement.js";const unused={[Symbol("x")]:1};export const value=42;',
                { 'replacement.js': `Reflect.set(globalThis,"Symbol",${replacement});` }
            );
            const project = createProject({
                withFiles: Array.from(emitted, function ([ filePath, content ]) {
                    return { filePath: `/output/${filePath}`, content };
                })
            });
            const entry = project.getSourceFileOrThrow('/output/index.js');
            const dependency = project.getSourceFileOrThrow('/output/replacement.js');
            assert.deepStrictEqual(
                entry.getDescendantsOfKind(SyntaxKind.CallExpression).map(function (call) {
                    return call.getText();
                }),
                [ 'Symbol("x")' ]
            );
            assert.deepStrictEqual(
                dependency.getDescendantsOfKind(SyntaxKind.CallExpression).map(function (call) {
                    return call.getExpression().getText();
                }),
                [ 'Reflect.set', 'events.push', 'events.push' ]
            );
            assertPublicValue(entry);
        });
    });
});
