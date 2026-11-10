import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createModuleExportIndex } from './module-export-index.ts';
import { normalizeStarExports } from './star-export-preparation.ts';

function normalizedFiles(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
    const fixture = createExportModuleFixture(files, []);
    const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
    normalizeStarExports(fixture.sources.map(createSourcePreparation), index, fixture.resolveModule);
    return Object.fromEntries(fixture.sources.map(function (source) {
        return [ source.getBaseName(), source.getFullText() ];
    }));
}

suite('star export preparation', function () {
    suite('closed namespaces', function () {
        test('rewrites visible names and excludes default exports', function () {
            const files = normalizedFiles({
                'index.js': 'export * from "./library.js";',
                'library.js': 'export const value=1;export default 42;'
            });
            assert.strictEqual(files['index.js'], 'export {value} from "./library.js";');
        });

        test('excludes conflicting names without losing distinct names', function () {
            const files = normalizedFiles({
                'index.js': 'export * from "./a.js";export * from "./b.js";',
                'a.js': 'export const first=1;export const clash=1;',
                'b.js': 'export const second=2;export const clash=2;'
            });
            assert.strictEqual(files['index.js'], 'export {first} from "./a.js";export {second} from "./b.js";');
        });

        test('retains explicit overrides and module evaluation requests', function () {
            const files = normalizedFiles({
                'index.js': 'export {value} from "./a.js";export * from "./a.js";export * from "./b.js";',
                'a.js': 'export const value=1;',
                'b.js': 'export const value=2;'
            });
            assert.strictEqual(
                files['index.js'],
                'export {value} from "./a.js";export {} from "./a.js";export {} from "./b.js";'
            );
        });

        test('assigns a shared defining binding to one original forwarding route', function () {
            const files = normalizedFiles({
                'index.js': 'export * from "./a.js";export * from "./b.js";',
                'a.js': 'export {value} from "./shared.js";',
                'b.js': 'export {value} from "./shared.js";',
                'shared.js': 'export const value=42;'
            });
            assert.strictEqual(files['index.js'], 'export {value} from "./a.js";export {} from "./b.js";');
        });

        test('plans cyclic module edits before changing any source files', function () {
            const files = normalizedFiles({
                'index.js': 'export * from "./cycle.js";export const first=1;',
                'cycle.js': 'export * from "./index.js";export const second=2;'
            });
            assert.strictEqual(files['index.js'], 'export {second} from "./cycle.js";export const first=1;');
            assert.strictEqual(files['cycle.js'], 'export {first} from "./index.js";export const second=2;');
        });

        test('preserves comments, module specifiers, and import attributes', function () {
            const files = normalizedFiles({
                'index.js': 'export /*before*/ * /*after*/ from "./library.js" with {type:"json"};',
                'library.js': 'export const value=1;'
            });
            assert.strictEqual(
                files['index.js'],
                'export /*before*/ {value} /*after*/ from "./library.js" with {type:"json"};'
            );
        });
    });

    suite('link failures and unknown schemas', function () {
        for (
            const consumer of [
                'import {clash} from "./barrel.js";export {};',
                'import missing from "./barrel.js";export {};',
                'export {missing} from "./barrel.js";'
            ]
        ) {
            test(`preserves failing named link requests: ${consumer}`, function () {
                const barrel = 'export * from "./a.js";export * from "./b.js";';
                const files = normalizedFiles({
                    'index.js': consumer,
                    'barrel.js': barrel,
                    'a.js': 'export const first=1;export const clash=1;',
                    'b.js': 'export const second=2;export const clash=2;'
                });
                assert.strictEqual(files['barrel.js'], barrel);
            });
        }

        test('leaves unknown external star schemas unchanged', function () {
            const content = 'export * from "./external.js";export const own=1;';
            assert.strictEqual(normalizedFiles({ 'index.js': content })['index.js'], content);
        });

        test('leaves unresolved named reexports unchanged', function () {
            const content = 'export {value} from "./external.js";';
            assert.strictEqual(normalizedFiles({ 'index.js': content })['index.js'], content);
        });

        test('leaves runtime-dependent namespace alias ambiguity unchanged', function () {
            const content = 'export * from "./a.js";export * from "./b.js";';
            const files = normalizedFiles({
                'index.js': content,
                'a.js': 'import * as ns from "./shared.js";export {ns as result};',
                'b.js': 'export * as result from "./shared.js";',
                'shared.js': 'export const value=42;'
            });
            assert.strictEqual(files['index.js'], content);
        });
    });

    suite('exported name spellings', function () {
        for (
            const name of [
                'plain',
                'if',
                'await',
                'é',
                '𐀀',
                'with space',
                '',
                'dash-name',
                'quote"name',
                String.raw`\u0061`,
                '0',
                '[object Object]'
            ]
        ) {
            test(`preserves exported name ${JSON.stringify(name)}`, function () {
                const files = normalizedFiles({
                    'index.js': 'export * from "./library.js";',
                    'library.js': `const value=42;export {value as ${JSON.stringify(name)}};`
                });
                const project = createProject({
                    withFiles: [ { filePath: '/repo/index.js', content: String(files['index.js']) } ]
                });
                const source = project.getSourceFileOrThrow('/repo/index.js');
                assert.strictEqual(source.getProject().getProgram().getSyntacticDiagnostics(source).length, 0);
                const [ declaration ] = source.getExportDeclarations();
                assert.strictEqual(declaration?.isNamespaceExport(), false);
                const [ exported ] = declaration.getNamedExports();
                assert.strictEqual(exported?.getNameNode().compilerNode.text, name);
            });
        }
    });
});
