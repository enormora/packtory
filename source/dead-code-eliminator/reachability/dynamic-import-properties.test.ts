import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { dynamicImportProperties } from './dynamic-import-properties.ts';

suite('dynamic import receiver demand', function () {
    for (
        const [ content, names ] of [
            [ 'export const value=42;export function read(){return this.value;}', [ 'read', 'value' ] ],
            [
                'export const value=42;export function answer(){return this.value;}export function read(){return this.answer();}',
                [ 'read', 'answer', 'value' ]
            ],
            [ 'export const value=42;export function read(){return this.missing();}', undefined ],
            [ 'export const value=42;function local(){return this.value;}export{local as read};', [ 'read', 'value' ] ]
        ] as const
    ) {
        test(`follows receiver observations in ${content}`, function () {
            const fixture = createExportModuleFixture({
                'index.js': 'export async function probe(){const ns=await import("./library.js");return ns.read();}',
                'library.js': content
            }, []);
            const call = fixture.source('index.js').getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            assert.deepStrictEqual(
                dynamicImportProperties(call, fixture.source('library.js')),
                names === undefined ? undefined : new Set(names)
            );
        });
    }
});
