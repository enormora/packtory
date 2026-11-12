import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    assertSingleFileCallReduction,
    singleFileOracleCase
} from '../test-libraries/dead-code-elimination-single-file-case.ts';
import {
    assertDeadCodeEliminationEquivalent,
    eliminateDeadCodeAndAssertAllOutputValid
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

suite('discarded object creation', function () {
    for (
        const statement of [
            'const unused={value:/*#__PURE__*/globalThis.compute()};',
            '({value:/*#__PURE__*/globalThis.compute()});',
            'const unused={value:/*#__PURE__*/globalThis.compute(),effect:console.log("effect")};',
            'const unused={value:/*#__PURE__*/globalThis.compute(console.log("argument"))};',
            'let value=globalThis.runtimeValue;const unused={value:/*#__PURE__*/globalThis.compute(value)};',
            'let value=/*#__PURE__*/globalThis.compute();const unused={value:/*#__PURE__*/globalThis.compute(value)};'
        ]
    ) {
        test(`removes a valid annotated call in ${statement}`, async function () {
            await assertSingleFileCallReduction({
                content: `globalThis.compute=()=>42;${statement}export function probe(){return 42;}`,
                targetFilePath: 'index.js',
                callee: 'globalThis.compute',
                remainingCalls: 0
            });
        });
    }

    test('removes an annotated construction while retaining its argument effect', async function () {
        const content = [
            'globalThis.Empty=class{};',
            'const unused={value:/*#__PURE__*/new globalThis.Empty(console.log("argument"))};',
            'export function probe(){return 42;}'
        ]
            .join('\n');
        const fixture = singleFileOracleCase(content, 'index.js');
        await assertDeadCodeEliminationEquivalent(fixture);
        const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
        const emitted = result[0]?.contents[0]?.fileDescription.content;
        assertDefined(emitted);
        const source = createProject().createSourceFile('output.js', emitted);
        assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.NewExpression).length, 0);
    });

    test('preserves the inferred name of an unused class initializer', async function () {
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
            'const unused=class{static{console.log(this.name);}};export function probe(){return 42;}',
            'index.js'
        ));
    });

    for (
        const content of [
            'const unused={removable:42,effect:console.log("first"),nested:{removable:21,effect:console.log("second")}};',
            'const {value}={value:console.log("first"),removable:42,effect:console.log("second")};',
            '({removable:42,effect:console.log("first"),get method(){console.log("never");}});',
            'const unused={removable:class{},effect:console.log("first")};',
            'const unused={removable:42,named:class{static{console.log(this.name);}}};',
            'const unused={removable:42,...{get value(){console.log("spread");return 42;}}};',
            'const key={toString(){console.log("key");return "value";}};' +
            'const unused={removable:42,[key]:console.log("value")};'
        ]
    ) {
        test(`removes unused properties while preserving effects in ${content}`, async function () {
            const fixture = singleFileOracleCase(`${content}export function probe(){return 42;}`, 'index.js');
            await assertDeadCodeEliminationEquivalent(fixture);
            const result = await eliminateDeadCodeAndAssertAllOutputValid(fixture);
            assert.strictEqual(result[0]?.contents[0]?.fileDescription.content.includes('removable'), false);
        });
    }

    for (
        const content of [
            'const unused={named:class{static{console.log(this.name);}}};',
            'const key={toString(){console.log("key");return "value";}};const unused={[key]:console.log("value")};',
            'const unused={...{get value(){console.log("spread");return 42;}}};',
            'const unused={missing};',
            'globalThis.compute=()=>42;const unused={value:/*#__PURE__*/globalThis.compute({missing})};',
            'globalThis.effect=callback=>console.log("effect");' +
            'const unused={value:globalThis.effect(()=>{/*#__PURE__*/globalThis.compute();})};',
            'globalThis.effect=value=>console.log(value);' +
            'const unused={value:globalThis.effect("/*#__PURE__*/")};',
            'const unused={__proto__:console.log("prototype"),value:console.log("value")};',
            'const unused={value:console.log("first"),value:console.log("second")};',
            'const unused={named:(class{static{console.log(this.name);}})};',
            'const unused={first:console.log("first"),...{get value(){console.log("spread");return 1;}},last:console.log("last")};',
            'const key={[Symbol.toPrimitive](){console.log("key");return "named";}};' +
            'const unused={[key]:class{static{console.log(this.name);}},value:console.log("last")};'
        ]
    ) {
        test(`preserves observable object creation in ${content}`, async function () {
            await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
                `${content}export function probe(){return 42;}`,
                'index.js'
            ));
        });
    }
});
