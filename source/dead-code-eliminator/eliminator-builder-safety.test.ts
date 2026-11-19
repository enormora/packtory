import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type SourceFile } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { isPureExpression } from '../test-libraries/expression-purity-test-support.ts';
import { schemaPackageFile, schemaPackageManifest } from './pure-expression-test-support.ts';
import { createDeadCodeEliminator, type InspectableDeadCodeEliminator } from './eliminator.ts';

type BuilderCase = {
    readonly name: string;
    readonly dependency: string;
    readonly computeBody: string;
    readonly program: string;
    readonly discardable: boolean;
};
function builderEliminator(dependency: string): InspectableDeadCodeEliminator {
    return createDeadCodeEliminator({
        createProject() {
            return createProject({
                withFiles: [ {
                    filePath: '/repo/node_modules/schema-lib/package.json',
                    content: '{"type":"module","exports":"./index.js"}'
                }, {
                    filePath: '/repo/node_modules/schema-lib/index.js',
                    content: dependency
                } ]
            });
        },
        progressBroadcaster: {
            emit() {
                return undefined;
            },
            hasSubscribers() {
                return false;
            }
        },
        trace: undefined
    });
}
const cases: readonly BuilderCase[] = [ {
    name: 'annotated async factories return promises',
    dependency: '/* @__NO_SIDE_EFFECTS__ */ export async function make() { return { method() { return {}; } }; }',
    computeBody: 'return 1;',
    program: 'const unused = make().method(compute());',
    discardable: false
}, {
    name: 'annotated generators return iterators',
    dependency: '/* @__NO_SIDE_EFFECTS__ */ export function* make() { return { method() { return {}; } }; }',
    computeBody: 'return 1;',
    program: 'const unused = make().method(compute());',
    discardable: false
}, {
    name: 'direct eval replaces an imported method',
    dependency: 'export const make = { method() { return {}; } };',
    computeBody: 'return 1;',
    program: 'eval("make.method = () => console.log(42)"); const unused = make.method();',
    discardable: false
}, {
    name: 'provider eval replaces an exported function',
    dependency: 'export let make = () => ({}); eval("make = () => console.log(42)");',
    computeBody: 'return 1;',
    program: 'const unused = make();',
    discardable: false
}, {
    name: 'replaced imported method',
    dependency: 'export const make = { method() { return {}; } };',
    computeBody: 'return 1;',
    program: 'make.method = () => console.log("effect"); const unused = make.method();',
    discardable: false
}, {
    name: 'imported method replaced through an alias',
    dependency: 'export const make = { method() { return {}; } };',
    computeBody: 'return 1;',
    program: 'const alias = make; alias.method = () => console.log("effect"); const unused = make.method();',
    discardable: false
}, {
    name: 'provider replaces its exported function',
    dependency: 'export let make = () => ({}); make = () => console.log("effect");',
    computeBody: 'return 1;',
    program: 'const unused = make();',
    discardable: false
}, {
    name: 'provider replaces its exported method',
    dependency: 'export const make = { method() { return {}; } }; make.method = () => console.log("effect");',
    computeBody: 'return 1;',
    program: 'const unused = make.method();',
    discardable: false
}, {
    name: 'receiver method changes another method',
    dependency:
        'export const make = { method() { return {}; }, replace() { this.method = () => console.log("effect"); } };',
    computeBody: 'return 1;',
    program: 'make.replace(); const unused = make.method();',
    discardable: false
}, {
    name: 'imported object escapes to an unknown call',
    dependency: 'export const make = { method() { return {}; } };',
    computeBody: 'return 1;',
    program:
        'function replace(object) { object.method = () => console.log("effect"); } replace(make); const unused = make.method();',
    discardable: false
}, {
    name: 'parameter stored in a returned object',
    dependency: 'export function make(value) { return { value }; }',
    computeBody: 'return 1;',
    program: 'const unused = { ...make(compute()) };',
    discardable: true
}, {
    name: 'identity factory',
    dependency: 'export function make(value) { return value; }',
    computeBody: 'return 1;',
    program: 'const unused = make(compute());',
    discardable: true
}, {
    name: 'pure factory and module initialization',
    dependency: 'console.log("load"); export function make() { return {}; }',
    computeBody: 'return 1;',
    program: 'const unused = make(compute());',
    discardable: true
}, {
    name: 'pure returned object spread',
    dependency: 'export function make() { return {}; }',
    computeBody: 'return 1;',
    program: 'const unused = { ...make(compute()) };',
    discardable: true
}, {
    name: 'pure fluent factory',
    dependency: 'export function make() { return { method() { return {}; } }; }',
    computeBody: 'return 1;',
    program: 'const unused = make().method(compute());',
    discardable: true
}, {
    name: 'returned initializer effects',
    dependency: 'export function make() { return { value: console.log("effect") }; }',
    computeBody: 'return 1;',
    program: 'const unused = make(compute());',
    discardable: false
}, {
    name: 'parameter default effects',
    dependency: 'export function make(value = console.log("effect")) { return {}; }',
    computeBody: 'return;',
    program: 'const unused = make(compute());',
    discardable: false
}, {
    name: 'parameter destructuring exceptions',
    dependency: 'export function make({ value }) { return {}; }',
    computeBody: 'return null;',
    program: 'const unused = make(compute());',
    discardable: false
}, {
    name: 'returned getter effects',
    dependency:
        'export function make() { return { get value() { console.log("get"); return 1; }, method() { return {}; } }; }',
    computeBody: 'return 1;',
    program: 'const unused = { ...make(compute()) };',
    discardable: false
}, {
    name: 'async return assimilation',
    dependency: 'export async function make() { return { get then() { console.log("then"); } }; }',
    computeBody: 'return 1;',
    program: 'const unused = make(compute());',
    discardable: false
}, {
    name: 'function properties versus returned object properties',
    dependency: 'export const make = () => ({ method() { return {}; } });',
    computeBody: 'return 1;',
    program: 'const unused = make.method(compute());',
    discardable: false
}, {
    name: 'dotted names versus nested properties',
    dependency: 'export const make = { "method.deep"() { return {}; } };',
    computeBody: 'return 1;',
    program: 'const unused = make.method.deep(compute());',
    discardable: false
} ];

async function emittedBuilderModule(content: string, dependency: string): Promise<SourceFile> {
    const bundle = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/repo/build/index.js',
        targetFilePath: 'index.js',
        content
    });
    const [ output ] = await builderEliminator(dependency).eliminate(inputs(bundle));
    const emitted = output?.contents[0]?.fileDescription.content;
    assertDefined(emitted);
    return createProject().createSourceFile('output.js', emitted);
}

suite('external builder runtime safety', function () {
    for (const fixture of cases) {
        test(fixture.name, function () {
            const content =
                `import {make} from "schema-lib";function compute(){${fixture.computeBody}}${fixture.program}`;
            const project = createProject({
                withFiles: [
                    {
                        filePath: '/project/source/index.ts',
                        content
                    },
                    schemaPackageManifest(),
                    schemaPackageFile(fixture.dependency)
                ]
            });
            const source = project.getSourceFileOrThrow('/project/source/index.ts');
            const initializer = source.getVariableDeclarationOrThrow('unused').getInitializerOrThrow();
            assert.strictEqual(isPureExpression(initializer, undefined), fixture.discardable);
        });
    }

    test('prunes aliased fluent builders while retaining external module initialization', async function () {
        const source = await emittedBuilderModule(
            'import {make} from "schema-lib";const build=make;const schema=build();const unused=schema.method();export const value=42;',
            'console.log("load");export function make(){return {method(){return {};}};}'
        );
        assert.deepStrictEqual(source.getDescendantsOfKind(SyntaxKind.CallExpression), []);
        assert.deepStrictEqual(
            source.getImportDeclarations().map(function (declaration) {
                return declaration.getModuleSpecifierValue();
            }),
            [ 'schema-lib' ]
        );
        assert.deepStrictEqual(
            source.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'value' ]
        );
    });

    test('retains calls to an imported method replaced by the caller', async function () {
        const source = await emittedBuilderModule(
            'import {make} from "schema-lib";make.method=()=>console.log("effect");const unused=make.method();export const value=42;',
            'export const make={method(){return {};}};'
        );
        const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
        assert.strictEqual(
            calls
                .filter(function (call) {
                    return call.getExpression().getText() === 'make.method';
                })
                .length,
            1
        );
        assert.deepStrictEqual(
            calls
                .filter(function (call) {
                    return call.getExpression().getText() === 'console.log';
                })
                .map(function (call) {
                    return call.getArguments().map(function (argument) {
                        return argument.getText();
                    });
                }),
            [ [ '"effect"' ] ]
        );
    });
});
