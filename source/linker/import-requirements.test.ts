import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { collectImportRequirements } from './import-requirements.ts';

function sourceFor(content: string): SourceFile {
    return createProject({
        withFiles: [
            { filePath: '/repo/index.js', content },
            { filePath: '/repo/library.js', content: 'export default 1;export const first=2;export const second=3;' }
        ]
    })
        .getSourceFileOrThrow('/repo/index.js');
}

suite('import requirements', function () {
    for (
        const content of [
            'import {readFile} from "node:fs";',
            'export {readFile} from "node:fs";',
            'import {missing} from "./missing.js";',
            'export {missing} from "./missing.js";',
            'const local=1;export {local};'
        ]
    ) {
        test(`does not create an unresolved source request for ${content}`, function () {
            assert.deepStrictEqual(collectImportRequirements(sourceFor(content), new Set()), []);
        });
    }

    test('combines default, named, namespace, and re-export requirements for the same target', function () {
        const source = sourceFor([
            'import value,{first as local} from "./library.js";',
            'import * as library from "./library.js";',
            'export {second as alias} from "./library.js";'
        ]
            .join('\n'));

        assert.deepStrictEqual(collectImportRequirements(source, new Set()), [ {
            inputFilePath: '/repo/library.js',
            requiredExportNames: new Set([ 'default', 'first', 'second' ]),
            requiresNamespaceExport: true
        } ]);
    });

    test('records namespace re-exports', function () {
        assert.deepStrictEqual(collectImportRequirements(sourceFor('export * from "./library.js";'), new Set()), [ {
            inputFilePath: '/repo/library.js',
            requiredExportNames: new Set(),
            requiresNamespaceExport: true
        } ]);
    });

    test('retains graph dependencies without a parsed source', function () {
        assert.deepStrictEqual(collectImportRequirements(undefined, new Set([ '/repo/library.js' ])), [ {
            inputFilePath: '/repo/library.js',
            requiredExportNames: new Set(),
            requiresNamespaceExport: false
        } ]);
    });
});
