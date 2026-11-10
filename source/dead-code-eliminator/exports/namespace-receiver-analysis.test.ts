import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createModuleExportIndex } from './module-export-index.ts';
import { createNamespaceReceiverAnalysis } from './namespace-receiver-analysis.ts';

function ignoresReceiver(files: Readonly<Record<string, string>>): boolean {
    const fixture = createExportModuleFixture(files, []);
    const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
    const access = fixture.source('index.js').getFirstDescendantByKindOrThrow(SyntaxKind.PropertyAccessExpression);
    return createNamespaceReceiverAnalysis(index, fixture.resolveModule)(access.getExpression(), access.getName());
}

const entry = 'import * as ns from "./library.js";export function probe(){return ns.used();}';

suite('namespace receiver analysis', function () {
    suite('proven unused receivers', function () {
        for (
            const declaration of [
                'export function used(){return 42;}',
                'export const used=()=>42;',
                'export const used=function(){return 42;};',
                'export function used(){console.log("called");return 42;}',
                'export function used(){throw new Error("called");}'
            ]
        ) {
            test(`proves ${declaration}`, function () {
                assert.strictEqual(ignoresReceiver({ 'index.js': entry, 'library.js': declaration }), true);
            });
        }

        test('follows named forwarding to the defining function', function () {
            assert.strictEqual(
                ignoresReceiver({
                    'index.js': entry,
                    'library.js': 'export {local as used} from "./definition.js";',
                    'definition.js': 'export function local(){return 42;}'
                }),
                true
            );
        });

        test('follows a namespace through a default export and local alias', function () {
            assert.strictEqual(
                ignoresReceiver({
                    'index.js':
                        'import source from "./wrapper.js";const ns=source;export function probe(){return ns.used();}',
                    'wrapper.js': 'import * as ns from "./library.js";export default ns;',
                    'library.js': 'export function used(){return 42;}'
                }),
                true
            );
        });
    });

    suite('unproved receivers', function () {
        for (const expression of [ 'missing', '({})' ]) {
            test(`does not infer a namespace receiver from ${expression}`, function () {
                assert.strictEqual(
                    ignoresReceiver({
                        'index.js': `export function probe(){return ${expression}.used();}`
                    }),
                    false
                );
            });
        }

        for (
            const declaration of [
                'export function used(){return this.unused;}',
                'export function used(value=this.unused){return value;}',
                'export function used(){const read=()=>this.unused;return read();}',
                'export function used(){return eval("this.unused");}',
                'export function used(){return 42;}used=function(){return this.unused;};',
                'export let used=()=>42;',
                'export const used=new Proxy(()=>42,{apply(target,receiver){return receiver.unused;}});',
                'export class used {}',
                'export const other=42;',
                'export function used(){return 42;}export function used(){return this.unused;}'
            ]
        ) {
            test(`rejects ${declaration}`, function () {
                assert.strictEqual(ignoresReceiver({ 'index.js': entry, 'library.js': declaration }), false);
            });
        }

        test('does not infer a namespace from an ordinary object type', function () {
            assert.strictEqual(
                ignoresReceiver({
                    'index.js': 'const ns={used(){return 42;}};export function probe(){return ns.used();}'
                }),
                false
            );
        });

        test('keeps ambiguous forwarded callable origins conservative', function () {
            assert.strictEqual(
                ignoresReceiver({
                    'index.js': entry,
                    'library.js': 'export * from "./a.js";export * from "./b.js";',
                    'a.js': 'export function used(){return 42;}',
                    'b.js': 'export function used(){return this.unused;}'
                }),
                false
            );
        });
    });
});
