import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
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
    for (
        const [ content, name ] of [ [ 'export function compute(){}', 'compute' ], [
            'export class Box{}',
            'Box'
        ] ] as const
    ) {
        test(`does not request primitive evaluation of the declaration ${name}`, function () {
            const fixture = createExportModuleFixture({ 'index.js': content }, []);
            const source = fixture.source('index.js');
            const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
            assert.deepStrictEqual(
                exportedModuleValue(fixture.source('index.js'), name, {
                    index,
                    resolveModule: fixture.resolveModule
                }, function () {
                    return assert.fail('Named declarations do not supply primitive values');
                }),
                name === 'compute' ? { kind: 'callable', source, name } : undefined
            );
        });
    }
    suite('completion boundaries', function () {
        for (
            const [ prefix, modules, known ] of [
                [ 'effect();await pending;', {}, false ],
                [ 'for await(const item of values){}', {}, false ],
                [ 'async function work(){await pending;}effect();', {}, true ],
                [ 'import "./dep.js";effect();', { 'dep.js': 'module.exports={};' }, false ],
                [ 'import "./dep.js";effect();', { 'dep.js': 'eval("effect()");export {};' }, false ]
            ] as const
        ) {
            test(`requires synchronous completion after ${prefix} with ${JSON.stringify(modules)}`, function () {
                const files = preparedFiles([
                    { filePath: 'index.js', content: `${prefix}export const value=42;` },
                    ...Object.entries(modules).map(function ([ filePath, content ]) {
                        return { filePath, content };
                    })
                ]);
                const snapshot = createModuleConstantSnapshot(files, function () {
                    return undefined;
                });
                const [ entry ] = files;
                assertDefined(entry);
                assert.deepStrictEqual(
                    snapshot.modules.get(entry.sourceFile)?.exports,
                    new Map(
                        known ? [ [ 'value', { kind: 'constant', value: { value: 42 } } ] ] : []
                    )
                );
            });
        }
    });

    test('rebuilds initialization dependencies after source transformations', function () {
        const files = preparedFiles([ { filePath: 'index.js', content: 'export const value=1;' } ]);
        const [ entry ] = files;
        assertDefined(entry);
        const before = createModuleConstantSnapshot(files, function () {
            return undefined;
        });
        assert.deepStrictEqual(before.modules.get(entry.sourceFile), {
            initialized: true,
            exports: new Map([ [ 'value', { kind: 'constant', value: { value: 1 } } ] ])
        });
        entry.sourceFile.insertStatements(0, 'import "external";');
        const after = createModuleConstantSnapshot(files, function () {
            return undefined;
        });
        assert.deepStrictEqual(after.modules.get(entry.sourceFile), { initialized: false, exports: new Map() });
    });

    test('records a primitive after effects when consumers run after the module completes', function () {
        const files = preparedFiles([ { filePath: 'index.js', content: 'unknown();export const value=1;' } ]);
        const snapshot = createModuleConstantSnapshot(files, function () {
            return undefined;
        });
        assert.deepStrictEqual(Array.from(snapshot.modules.values()), [ {
            initialized: true,
            exports: new Map([ [ 'value', { kind: 'constant', value: { value: 1 } } ] ])
        } ]);
    });

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
        if (entry === undefined) {
            assert.fail('Expected entry module');
        }
        if (library === undefined) {
            assert.fail('Expected library module');
        }
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

    for (
        const content of [
            'export default class{}',
            'export default function(){}',
            'export class Value{}',
            'export function value(){}',
            'export enum Value{first}'
        ]
    ) {
        test(`keeps declarations outside primitive snapshots for ${content}`, function () {
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
