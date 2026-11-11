import { suite, test } from 'mocha';
import { assertImportedValueCase, type ImportedValueCase } from '../test-libraries/imported-value-case.ts';

const snapshotLibrary =
    'function make(n){const state={value:n};for(let i=0;i<4;i++)state.value++;return state.value;}export const key=make(38);';
const importedKeyName = 'key';
const cases: readonly ImportedValueCase[] = [
    [
        'bigint-named-result',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return key;}' },
        'export const key=0x20_0000_0000_0001n;',
        'return key',
        '9007199254740993n',
        null
    ],
    [
        'bigint-default-result',
        { 'index.js': 'import key from "schema-lib";export function probe(){return key;}' },
        'export default -0x20_0000_0000_0001n;',
        'return key',
        '-9007199254740993n',
        null
    ],
    [
        'bigint-switch-result',
        {
            'index.js':
                'import {key} from "schema-lib";function compute(n){switch(n){case 1n:return 42;default:return 0;}}' +
                'export function probe(){return compute(key);}'
        },
        'export const key=1n;',
        'compute(',
        null,
        null
    ],
    [
        'namespace-result',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){return library.key;}' },
        snapshotLibrary,
        'library.key',
        null,
        null
    ],
    [
        'named-result',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return key;}' },
        snapshotLibrary,
        'return key',
        null,
        null
    ],
    [
        'default-result',
        { 'index.js': 'import key from "schema-lib";export function probe(){return key;}' },
        'export default 42;',
        'return key',
        null,
        null
    ],
    [
        'renamed-result',
        { 'index.js': 'import {key as local} from "schema-lib";export function probe(){return local;}' },
        snapshotLibrary,
        'return local',
        null,
        null
    ],
    [
        'used-record-loop',
        {
            'index.js':
                'import {key} from "schema-lib";function compute(n){const state={sum:0};for(let i=0;i<n;i++)state.sum+=i;return state.sum;}export function probe(){return compute(key);}'
        },
        snapshotLibrary,
        'compute(',
        null,
        null
    ],
    [
        'used-recursion',
        {
            'index.js':
                'import * as library from "schema-lib";function fib(n){return n<2?n:fib(n-1)+fib(n-2);}export function probe(){return fib(library.key);}'
        },
        'export const key=10;',
        'fib(',
        null,
        null
    ],
    [
        'specialized-branch',
        {
            'index.js':
                'import {key} from "schema-lib";export function probe(){if(key!==42){console.log("unreachable");return -1;}return 42;}'
        },
        snapshotLibrary,
        'unreachable',
        null,
        null
    ],
    [
        'argument-order',
        {
            'index.js':
                'import {key} from "schema-lib";function select(first,second){return second;}export function probe(){return select(console.log("argument"),key);}'
        },
        snapshotLibrary,
        null,
        null,
        null
    ],
    [
        'computed-key',
        {
            'index.js':
                'import * as library from "schema-lib";export function probe(){return {[library.key]:"answer"};}'
        },
        snapshotLibrary,
        'library.key',
        null,
        null
    ],
    [
        'default-parameter',
        { 'index.js': 'import {key} from "schema-lib";export function probe(value=key){return value;}' },
        snapshotLibrary,
        'value=key',
        null,
        null
    ],
    [
        'destructuring-default',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){const {value=key}={};return value;}' },
        snapshotLibrary,
        'value=key',
        null,
        null
    ],
    [
        'shorthand',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return {key};}' },
        snapshotLibrary,
        null,
        null,
        null
    ],
    [
        'property-name',
        { 'index.js': 'import {key} from "schema-lib";export function probe(value={key:1}){return value.key+key;}' },
        snapshotLibrary,
        null,
        'value.key',
        null
    ],
    [
        'template',
        {
            'index.js': `import {${importedKeyName}} from "schema-lib";
export function probe(){return \`answer \${${importedKeyName}}\`;}`
        },
        snapshotLibrary,
        `\${${importedKeyName}}`,
        null,
        null
    ],
    [
        'class-field',
        {
            'index.js':
                'import {key} from "schema-lib";class Value{answer=key;}export function probe(){return new Value().answer;}'
        },
        snapshotLibrary,
        'answer=key',
        null,
        null
    ],
    [
        'nullish-optional',
        {
            'index.js':
                'import {key} from "schema-lib";export function probe(){return key?.unknown(console.log("never"));}'
        },
        'export const key=null;',
        'never',
        null,
        null
    ],
    [
        'negative-zero',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return Object.is(key,-0);}' },
        'export const key=-0;',
        null,
        null,
        null
    ],
    [
        'nan-shadowed',
        {
            'index.js':
                'import {key} from "schema-lib";export function probe(){const NaN=1;return [Number.isNaN(key),NaN];}'
        },
        'export const key=0/0;',
        null,
        null,
        null
    ],
    [
        'infinity-shadowed',
        {
            'index.js':
                'import {key} from "schema-lib";export function probe(){const Infinity=1;return [key===1/0,Infinity];}'
        },
        'export const key=1/0;',
        null,
        null,
        null
    ],
    [
        'undefined-shadowed',
        {
            'index.js':
                'import {key} from "schema-lib";export function probe(){const undefined=42;return [typeof key,undefined];}'
        },
        'export const key=void 0;',
        null,
        null,
        null
    ],
    [
        'delete-namespace',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){return delete library.key;}' },
        snapshotLibrary,
        null,
        'delete library.key',
        'TypeError'
    ],
    [
        'delete-wrapped-namespace',
        {
            'index.js':
                'import * as library from "schema-lib";export function probe(){return delete (((library.key)));}'
        },
        snapshotLibrary,
        null,
        'library.key',
        'TypeError'
    ],
    [
        'assignment-namespace',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){library.key=43;return 42;}' },
        snapshotLibrary,
        null,
        'library.key=43',
        'TypeError'
    ],
    [
        'compound-namespace',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){library.key+=1;return 42;}' },
        snapshotLibrary,
        null,
        'library.key+=1',
        'TypeError'
    ],
    [
        'update-namespace',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){return library.key++;}' },
        snapshotLibrary,
        null,
        'library.key++',
        'TypeError'
    ],
    [
        'destructuring-target',
        {
            'index.js':
                'import * as library from "schema-lib";export function probe(){({value:library.key}={value:1});return 42;}'
        },
        snapshotLibrary,
        null,
        'value:library.key',
        'TypeError'
    ],
    [
        'rest-target',
        {
            'index.js': 'import * as library from "schema-lib";export function probe(){[...library.key]=[1];return 42;}'
        },
        snapshotLibrary,
        null,
        '...library.key',
        'TypeError'
    ],
    [
        'iteration-target',
        {
            'index.js':
                'import * as library from "schema-lib";export function probe(){for(library.key of [1]){}return 42;}'
        },
        snapshotLibrary,
        null,
        'for(library.key',
        'TypeError'
    ],
    [
        'named-assignment',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){key=1;return key;}' },
        snapshotLibrary,
        null,
        'key=1',
        'TypeError'
    ],
    [
        'primitive-call',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){return library.key();}' },
        snapshotLibrary,
        null,
        'library.key()',
        'TypeError'
    ],
    [
        'primitive-construction',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){return new library.key();}' },
        snapshotLibrary,
        null,
        'new library.key()',
        'TypeError'
    ],
    [
        'primitive-tag',
        { 'index.js': 'import * as library from "schema-lib";export function probe(){return library.key`value`;}' },
        snapshotLibrary,
        null,
        'library.key`value`',
        'TypeError'
    ],
    [
        'mutable-binding',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return key;}' },
        'export let key=42;key=43;',
        null,
        'return key',
        null
    ],
    [
        'mutable-member',
        { 'index.js': 'import {record} from "schema-lib";export function probe(){return record.key;}' },
        'export const record={key:42};record.key=43;',
        null,
        'record.key',
        null
    ],
    [
        'direct-eval',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return eval("key")+key;}' },
        snapshotLibrary,
        null,
        'return eval("key")+key',
        null
    ],
    [
        'producer-cycle',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return key;}probe();' },
        'import {probe} from "../package/index.js";probe();export const key=42;',
        null,
        'return key',
        'ReferenceError'
    ],
    [
        'consumer-early-call',
        {
            'index.js': 'import "./early.js";import {key} from "schema-lib";export function probe(){return key;}',
            'early.js': 'import {probe} from "./index.js";probe();'
        },
        snapshotLibrary,
        null,
        'return key',
        'ReferenceError'
    ],
    [
        'initialization-effects',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return key;}' },
        'console.log("initialize");export const key=42;',
        null,
        'return key',
        null
    ],
    [
        'effect-after-initialization',
        { 'index.js': 'import {key} from "schema-lib";export function probe(){return key;}' },
        'export const key=42;console.log("initialized");',
        null,
        'return key',
        null
    ]
];

suite('imported value specialization', function () {
    for (const input of cases) {
        test(input[0], async function () {
            await assertImportedValueCase(input);
        });
    }
});
