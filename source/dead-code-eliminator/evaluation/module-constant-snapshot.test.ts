import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { createModuleExportIndex } from '../exports/module-export-index.ts';
import type { PreparedModule } from '../exports/prepared-module-graph.ts';
import { createModuleConstantSnapshot } from './module-constant-snapshot.ts';
import { exportedModuleValue } from './module-export-value.ts';

function preparedFiles(
    contents: readonly { readonly filePath: string; readonly content: string; }[]
): readonly PreparedModule[] {
    return multiFileBindingsFor(contents).map(function (file) {
        return { ...file, sourceFile: file.sourceFile.getSourceFile() };
    });
}

suite('module constant snapshots', function () {
    test('captures constants, aliases, and namespace exports across prepared modules', function () {
        const files = preparedFiles([
            {
                filePath: 'index.js',
                content: 'export {value as renamed} from "./library.js";export * as library from "./library.js";'
            },
            { filePath: 'library.js', content: 'export const value=42;export default false;' }
        ]);
        const snapshot = createModuleConstantSnapshot(files, function () {
            assert.fail('prepared local modules must resolve without external lookup');
        });
        const [ entry, library ] = files;
        assert.ok(entry !== undefined && library !== undefined);
        assert.deepStrictEqual(snapshot.modules.get(entry.sourceFile), {
            initialized: true,
            exports: new Map([
                [ 'renamed', { kind: 'constant', value: { value: 42 } } ],
                [ 'library', { kind: 'namespace', source: library.sourceFile } ]
            ])
        });
        assert.deepStrictEqual(snapshot.modules.get(library.sourceFile), {
            initialized: true,
            exports: new Map([
                [ 'value', { kind: 'constant', value: { value: 42 } } ],
                [ 'default', { kind: 'constant', value: { value: false } } ]
            ])
        });
    });

    for (
        const { content, initialized } of [
            { content: 'eval("unknown()");export const value=1;', initialized: true },
            { content: 'export const value=1;eval("unknown()");', initialized: true },
            { content: 'unknown();export const value=1;', initialized: true },
            { content: 'module.exports={value:1};', initialized: false },
            { content: 'import type {Thing} from "external";export const value=1;', initialized: false },
            { content: 'import "external";export const value=1;', initialized: false }
        ]
    ) {
        test(`withholds unsafe snapshot values for ${content}`, function () {
            const files = preparedFiles([ { filePath: 'index.ts', content } ]);
            const snapshot = createModuleConstantSnapshot(files, function () {
                return undefined;
            });
            assert.deepStrictEqual(Array.from(snapshot.modules.values()), [ { initialized, exports: new Map() } ]);
        });
    }

    test('rejects unknown export status before resolving a syntactic namespace', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'export * as library from "./library.js";',
            'library.js': 'export const value=42;'
        }, []);
        const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
        const source = fixture.source('index.js');
        assert.strictEqual(
            exportedModuleValue(source, 'library', {
                index: {
                    ...index,
                    status() {
                        return 'unknown';
                    }
                },
                resolveModule() {
                    assert.fail('unknown status must stop namespace resolution');
                }
            }, function () {
                assert.fail('unknown status must stop binding evaluation');
            }),
            undefined
        );
    });

    for (const content of [ 'export default class{}', 'export default function(){}' ]) {
        test(`keeps callable default exports outside primitive snapshots for ${content}`, function () {
            const sourceFile = createProject().createSourceFile('/source/index.js', content);
            const snapshot = createModuleConstantSnapshot([ {
                sourceFile,
                targetFilePath: 'index.js',
                moduleReferences: []
            } ], function () {
                return undefined;
            });
            assert.deepStrictEqual(snapshot.modules.get(sourceFile)?.exports, new Map());
        });
    }
});
