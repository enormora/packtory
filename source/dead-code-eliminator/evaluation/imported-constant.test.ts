import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { isPureExpression } from '../../test-libraries/expression-purity-test-support.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { constantBinding, evaluateImportedConstant } from './imported-constant.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type ConstantCase = readonly [
    name: string,
    statement: string,
    expression: string,
    library: string,
    expected: EvaluatedValue | undefined
];

const cases: readonly ConstantCase[] = [
    [ 'uninitialized constant', 'import {key} from "./library.js";', 'key', 'export const key;', undefined ],
    [ 'export assignment', 'import key from "./library.js";', 'key', 'export = 42;', undefined ],
    [
        'root read before an unrelated dependency can initialize',
        'import {key} from "./library.js";import "external";',
        'key',
        'export const key=42;',
        { value: 42 }
    ],
    [
        'named value alongside a default',
        'import {key} from "./library.js";',
        'key',
        'export default 99;export const key=42;',
        { value: 42 }
    ],
    [
        'minimum positive number',
        'import {key} from "./library.js";',
        'key',
        'export const key=5e-324;',
        { value: Number.MIN_VALUE }
    ],
    [ 'named import', 'import {key} from "./library.js";', 'key', 'export const key="value";', { value: 'value' } ],
    [ 'namespace import', 'import * as library from "./library.js";', 'library.key', 'export const key=1+2;', {
        value: 3
    } ],
    [ 'renamed import', 'import {key as local} from "./library.js";', 'local', 'export const key=42;', { value: 42 } ],
    [ 'local export alias', 'import {name} from "./library.js";', 'name', 'const key="value";export {key as name};', {
        value: 'value'
    } ],
    [ 'default value', 'import key from "./library.js";', 'key', 'export default 42;', { value: 42 } ],
    [ 'default snapshot', 'import key from "./library.js";', 'key', 'const name="value";export default name;', {
        value: 'value'
    } ],
    [ 'default alias', 'import key from "./library.js";', 'key', 'const name="value";export {name as default};', {
        value: 'value'
    } ],
    [ 'undefined value', 'import {key} from "./library.js";', 'key', 'export const key=undefined;', {
        value: undefined
    } ],
    [ 'negative zero', 'import {key} from "./library.js";', 'key', 'export const key=-0;', { value: -0 } ],
    [ 'mixed numeric types', 'import {key} from "./library.js";', 'key', 'export const key=42n+1;', undefined ],
    [ 'null value', 'import {key} from "./library.js";', 'key', 'export const key=null;', { value: null } ],
    [ 'false value', 'import {key} from "./library.js";', 'key', 'export const key=false;', { value: false } ],
    [ 'mjs module', 'import {key} from "./library.mjs";', 'key', 'export const key="value";', { value: 'value' } ],
    [
        'quoted export',
        'import {"quoted key" as key} from "./library.js";',
        'key',
        'const value="value";export {value as "quoted key"};',
        { value: 'value' }
    ],
    [
        'record evaluation',
        'import {key} from "./library.js";',
        'key',
        'function make(n){const state={value:n};for(let i=0;i<4;i++)state.value++;return state.value;}export const key=make(38);',
        { value: 42 }
    ],
    [
        'local Symbol binding',
        'import {key} from "./library.js";',
        'key',
        'function Symbol(){return "value";}export const key=Symbol();',
        { value: 'value' }
    ],
    [
        'mutable object field',
        'import {metadata} from "./library.js";',
        'metadata.key',
        'export const metadata={key:"value"};',
        undefined
    ],
    [
        'exported object',
        'import {metadata} from "./library.js";',
        'metadata',
        'export const metadata={metadata:"value"};',
        undefined
    ],
    [ 'mutable binding', 'import {key} from "./library.js";', 'key', 'export let key="value";', undefined ],
    [ 'function value', 'import {key} from "./library.js";', 'key', 'export const key=()=>"value";', undefined ],
    [
        'snapshot before initialization',
        'import key from "./library.js";',
        'key',
        'export default name;const name="value";',
        undefined
    ],
    [
        'import cycle',
        'import {key} from "./library.js";',
        'key',
        'import "./index.js";export const key="value";',
        undefined
    ],
    [ 'missing export', 'import {key} from "./library.js";', 'key', 'export const other="value";', undefined ],
    [ 'unresolved Symbol', 'import {key} from "./library.js";', 'key', 'export const key=Symbol();', undefined ],
    [ 'CommonJS module', 'import {key} from "./library.cjs";', 'key', 'exports.key="value";', undefined ]
];

suite('imported constant evaluation', function () {
    for (const [ name, statement, expression, library, expected ] of cases) {
        test(`evaluates ${name}`, function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/repo/package.json', content: '{"type":"module"}' },
                    { filePath: '/repo/index.js', content: `${statement}const unused={[${expression}]:1};` }
                ]
            });
            const source = project.getSourceFileOrThrow('/repo/index.js');
            const [ declaration ] = source.getImportDeclarations();
            assertDefined(declaration);
            project.createSourceFile(`/repo/${declaration.getModuleSpecifierValue()}`, library);
            const object = source.getVariableDeclarationOrThrow('unused').getInitializerOrThrow();
            const key = object.getFirstDescendantByKindOrThrow(SyntaxKind.ComputedPropertyName).getExpression();

            assert.deepStrictEqual(evaluateImportedConstant(key, resolveRuntimeModule), expected);
            assert.strictEqual(isPureExpression(object, undefined), expected !== undefined);
        });
    }

    for (
        const { name, dependency, expected } of [
            { name: 'acyclic capture', dependency: 'export const ready=true;', expected: { value: 42 } },
            {
                name: 'early call through a cycle',
                dependency: 'import {probe} from "./index.js";probe();',
                expected: undefined
            },
            { name: 'unknown dependency initialization', dependency: 'unknown();', expected: undefined }
        ]
    ) {
        test(`checks ${name}`, function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/repo/package.json', content: '{"type":"module"}' },
                    {
                        filePath: '/repo/index.js',
                        content: 'import "./early.js";import {key} from "./library.js";' +
                            'export function probe(){const unused={[key]:1};return 42;}'
                    },
                    { filePath: '/repo/early.js', content: dependency },
                    { filePath: '/repo/library.js', content: 'export const key=42;' }
                ]
            });
            const source = project.getSourceFileOrThrow('/repo/index.js');
            const key = source.getFirstDescendantByKindOrThrow(SyntaxKind.ComputedPropertyName).getExpression();
            assert.deepStrictEqual(evaluateImportedConstant(key, resolveRuntimeModule), expected);
        });
    }

    suite('initialization', function () {
        for (const expression of [ 'library', 'library.nested.value' ]) {
            test(`does not resolve unsupported constant paths: ${expression}`, function () {
                const source = createProject().createSourceFile(
                    'input.ts',
                    `import * as library from "library";const result=${expression};`
                );
                const read = source.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
                assert.strictEqual(
                    evaluateImportedConstant(read, function () {
                        return assert.fail('Unsupported paths must not resolve modules');
                    }),
                    undefined
                );
            });
        }

        for (
            const [ content, kind, expected ] of [
                [ 'export const value=42;', SyntaxKind.VariableDeclaration, '42' ],
                [ 'const value;', SyntaxKind.VariableDeclaration, undefined ],
                [ 'let value=42;', SyntaxKind.VariableDeclaration, undefined ],
                [ 'function value(){}', SyntaxKind.FunctionDeclaration, undefined ],
                [ '{const value=42;}', SyntaxKind.VariableDeclaration, undefined ],
                [ 'for(const value=0;value<1;){break;}', SyntaxKind.VariableDeclaration, undefined ],
                [ 'export default 42;', SyntaxKind.ExportAssignment, '42' ],
                [ 'export = 42;', SyntaxKind.ExportAssignment, undefined ],
                [ 'namespace scope { export default 42; }', SyntaxKind.ExportAssignment, undefined ]
            ] as const
        ) {
            test(`finds supported initialization in ${content}`, function () {
                const source = createProject().createSourceFile('input.ts', content);
                const declaration = source.getFirstDescendantByKindOrThrow(kind);
                assert.strictEqual(constantBinding(declaration)?.expression.getText(), expected);
            });
        }

        for (
            const [ content, expected ] of [
                [ 'export default 42;', { value: 42 } ],
                [ 'export default 42;export default 43;', undefined ]
            ] as const
        ) {
            test(`requires an unambiguous default in ${content}`, function () {
                const project = createProject({
                    withFiles: [
                        { filePath: '/source/provider.js', content },
                        {
                            filePath: '/source/index.js',
                            content: 'import value from "./provider.js";export const result=value;'
                        }
                    ]
                });
                const source = project.getSourceFileOrThrow('/source/index.js');
                const expression = source.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
                const value = evaluateImportedConstant(expression, function () {
                    return project.getSourceFileOrThrow('/source/provider.js');
                });
                assert.deepStrictEqual(value, expected);
            });
        }
    });
});
