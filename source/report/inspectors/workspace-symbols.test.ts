import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { inspectModuleSymbols } from './workspace-symbols.ts';

suite('workspace symbols', function () {
    test('distinguishes type-only aliases from runtime values', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/index.ts',
                    content:
                        "export type { Model } from './model.js'; export { Model as RuntimeModel, type Model as TypeModel } from './model.js';"
                },
                { filePath: '/model.ts', content: 'export class Model {}' }
            ]
        });
        assert.deepStrictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/index.ts')), {
            values: [ 'RuntimeModel' ],
            types: [ 'Model', 'RuntimeModel', 'TypeModel' ],
            complete: true
        });
    });

    test('resolves cyclic and namespace forwarding without recursion overflow', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/a.ts', content: "export * from './b.js'; export const a = 1;" },
                { filePath: '/b.ts', content: "export * from './a.js'; export * as nested from './c.js';" },
                { filePath: '/c.ts', content: 'export const c = 1;' }
            ]
        });
        assert.deepStrictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/a.ts')), {
            values: [ 'a', 'nested' ],
            types: [],
            complete: true
        });
    });

    test('reports missing and CommonJS surfaces as incomplete', function () {
        assert.deepStrictEqual(inspectModuleSymbols(undefined), { values: [], types: [], complete: false });
        const project = createProject({
            withFiles: [ { filePath: '/module.cjs', content: 'module.exports = load();' } ]
        });
        assert.strictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/module.cjs')).complete, false);
    });

    test('finds unresolved exports beyond a cycle and ignores unreachable modules', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/a.ts', content: "export * from './b.js'; export const a = 1;" },
                { filePath: '/b.ts', content: "export * from './a.js'; export * from './c.js';" },
                { filePath: '/c.ts', content: "export * from 'missing';" },
                { filePath: '/isolated.ts', content: 'export const isolated = 1;' }
            ]
        });
        assert.strictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/a.ts')).complete, false);
        assert.deepStrictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/isolated.ts')), {
            values: [ 'isolated' ],
            types: [],
            complete: true
        });
    });

    test('resolves local export aliases without a forwarding module', function () {
        const project = createProject({
            withFiles: [ { filePath: '/index.ts', content: 'const local = 1; export { local as renamed };' } ]
        });
        assert.deepStrictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/index.ts')), {
            values: [ 'renamed' ],
            types: [],
            complete: true
        });
    });
});
