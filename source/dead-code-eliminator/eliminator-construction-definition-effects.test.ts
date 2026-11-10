import { suite, test } from 'mocha';
import { singleFileOracleCase } from '../test-libraries/dead-code-elimination-single-file-case.ts';
import { assertDeadCodeEliminationEquivalent } from '../test-libraries/dead-code-elimination-oracle-test-support.ts';

suite('construction definition effects', function () {
    for (
        const [ name, definition ] of [
            [ 'a static block beside a method', 'class{static{console.log("static");}method(){}}' ],
            [ 'a later computed key', 'class{first(){}[console.log("key")](){}}' ],
            [ 'a later static initializer', 'class{static first=1;static second=console.log("second");}' ],
            [ 'a later initialization exception', 'class{static first=1;static second=missing;}' ],
            [ 'a later invalid static name', 'class{first(){}static ["prototype"]=1;}' ]
        ]
    ) {
        test(`preserves ${name}`, async function () {
            await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
                `export const value=typeof new(${definition});export function probe(){return value;}`,
                'index.js'
            ));
        });
    }

    test('preserves a proxy read whose property type names a local class', async function () {
        await assertDeadCodeEliminationEquivalent(singleFileOracleCase(
            'import * as namespace from "./index.js";export class Empty{}const proxy=/** @type {typeof namespace} */ (new Proxy(namespace,{get(target,key){console.log("get");return target[key];}}));export const value=typeof new proxy.Empty();export function probe(){return value;}',
            'index.js'
        ));
    });
});
