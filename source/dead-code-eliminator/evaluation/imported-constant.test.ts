import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { isPureExpression } from '../../test-libraries/expression-purity-test-support.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { evaluateImportedConstant } from './imported-constant.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type ConstantCase = readonly [
    name: string,
    statement: string,
    expression: string,
    library: string,
    expected: EvaluatedValue | undefined
];

const cases: readonly ConstantCase[] = [
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
});
