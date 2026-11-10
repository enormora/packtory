import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { reduceObjectBindings } from './object-binding-reduction.ts';

const cases: readonly (readonly [string, string])[] = [
    [ 'const {}={};', ';' ],
    [ 'let {value}={value:1};', ';' ],
    [ 'var {value}={value:1};', ';' ],
    [ 'const {value=unknown()}={value:1};', ';' ],
    [ 'const {value=()=>missing()}={value:undefined};', ';' ],
    [ 'const {value=(()=>1)()}={value:undefined};', ';' ],
    [ 'const {value}={value:unknown()};', '({value:unknown()});' ],
    [ 'const origin={value:unknown()};const {value}=origin;export{};', 'const origin={value:unknown()};;export{};' ],
    [ 'const {value=(()=>{const {}={};})}={value:1};', ';' ]
];

suite('object binding reduction', function () {
    for (const [ original, expected ] of cases) {
        test(`preserves observable creation while removing ${original}`, function () {
            const source = createProject().createSourceFile('input.ts', original);
            reduceObjectBindings(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), expected);
        });
    }

    for (
        const content of [
            'const {value}={get value(){unknown();}};',
            'const {missing}={known:1};',
            'const {}={...unknown()};',
            'const {value}=unknown();',
            'const {value=unknown()}={value:undefined};',
            'const {[unknown()]:value}={};',
            'const {[unknown()]:value}={__proto__:null};',
            'const {...rest}={};',
            'const {...rest}={rest:1};',
            'const {value}={value:1};use(value);',
            'export const {value}={value:1};',
            'declare const {value}: {value:number};',
            'const {value};',
            'using {value}={value:1};',
            'const {value}={value:1},other=2;',
            'const [value]=[];',
            'const value={};',
            'const {}={};eval("unknown()");'
        ]
    ) {
        test(`retains unproven binding effects for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            reduceObjectBindings(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), content);
        });
    }
});
