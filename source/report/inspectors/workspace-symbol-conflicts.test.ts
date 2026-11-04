import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { inspectModuleSymbols } from './workspace-symbols.ts';

suite('workspace symbol conflicts', function () {
    test('marks conflicting star exports as unknown rather than selecting one provider', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/index.ts', content: "export * from './a.js'; export * from './b.js';" },
                { filePath: '/a.ts', content: 'export const conflict = 1;' },
                { filePath: '/b.ts', content: 'export const conflict = 2;' }
            ]
        });
        assert.deepStrictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/index.ts')), {
            values: [],
            types: [],
            complete: false
        });
    });

    test('treats unresolved imported aliases as unknown and keeps direct export declarations', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/index.ts',
                    content: "import { missing } from 'external'; export { missing }; export const local = 1;"
                }
            ]
        });
        assert.partialDeepStrictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/index.ts')), {
            values: [ 'local' ],
            complete: false
        });
    });

    test('merges class declarations with namespaces while preserving value and type namespaces', function () {
        const project = createProject({
            withFiles: [
                {
                    filePath: '/index.ts',
                    content:
                        'export class Model {} export namespace Model { export const extra = 1; } export type Data = string;'
                }
            ]
        });
        assert.deepStrictEqual(inspectModuleSymbols(project.getSourceFileOrThrow('/index.ts')), {
            values: [ 'Model' ],
            types: [ 'Data', 'Model' ],
            complete: true
        });
    });
});
