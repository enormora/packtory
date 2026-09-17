import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, type SourceFile } from 'ts-morph';
import {
    hasDeadCodeEliminationExportedName,
    type DeadCodeEliminationExportCheckMode
} from './export-resolution.ts';

type SourceByPath = ReadonlyMap<string, SourceFile | undefined>;

function createProject(): Project {
    return new Project({
        compilerOptions: {
            allowJs: true,
            module: ModuleKind.Node16,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node16,
            noLib: true
        },
        skipLoadingLibFiles: true
    });
}

function sourceFile(content: string): SourceFile {
    return createProject().createSourceFile('/pkg/index.js', content);
}

function sourceFiles(files: Readonly<Record<string, string | undefined>>): SourceByPath {
    const project = createProject();
    return new Map(
        Object.entries(files).map(function ([ targetPath, content ]) {
            return [
                targetPath,
                content === undefined ? undefined : project.createSourceFile(`/pkg/${targetPath}`, content)
            ];
        })
    );
}

function hasExport(
    content: string,
    exportName: string,
    mode: DeadCodeEliminationExportCheckMode = 'runtime'
): boolean {
    return hasDeadCodeEliminationExportedName({
        maximumDepth: 2,
        mode,
        targetPath: 'index.js',
        exportName,
        sourceFile: sourceFile(content),
        resolver: {
            resolve() {
                return undefined;
            }
        }
    });
}

function hasExportThroughGraph(
    files: SourceByPath,
    exportName: string,
    mode: DeadCodeEliminationExportCheckMode = 'runtime'
): boolean {
    const indexSourceFile = files.get('index.js');
    if (indexSourceFile === undefined) {
        assert.fail('Expected index.js source file');
    }
    return hasDeadCodeEliminationExportedName({
        maximumDepth: 2,
        mode,
        targetPath: 'index.js',
        exportName,
        sourceFile: indexSourceFile,
        resolver: {
            resolve(importerTargetPath, resolverMode, specifier) {
                assert.strictEqual(resolverMode, mode);
                const targetPath = specifier.replace(/^\.\//u, '');
                const resolved = files.get(targetPath);
                return {
                    targetPath,
                    sourceFile: resolved,
                    targetOnly: resolved === undefined || importerTargetPath === 'target-only.js'
                };
            }
        }
    });
}

function hasExportThroughUnparsedTarget(content: string, exportName: string): boolean {
    return hasDeadCodeEliminationExportedName({
        maximumDepth: 2,
        mode: 'runtime',
        targetPath: 'index.js',
        exportName,
        sourceFile: sourceFile(content),
        resolver: {
            resolve(_importerTargetPath, _resolverMode, specifier) {
                return {
                    targetPath: specifier.replace(/^\.\//u, ''),
                    sourceFile: undefined,
                    targetOnly: false
                };
            }
        }
    });
}

suite('dead code elimination export resolution', function () {
    test('does not report non-exported declarations as exported names', function () {
        const content = [
            'function functionName() {}',
            'class ClassName {}',
            'interface InterfaceName {}',
            'type TypeName = string;',
            'enum EnumName { A }',
            'namespace NamespaceName {}',
            'const variableName = 1;',
            ''
        ]
            .join('\n');

        assert.deepStrictEqual([
            hasExport(content, 'functionName'),
            hasExport(content, 'ClassName'),
            hasExport(content, 'InterfaceName'),
            hasExport(content, 'TypeName'),
            hasExport(content, 'EnumName'),
            hasExport(content, 'NamespaceName'),
            hasExport(content, 'variableName'),
            hasExport(content, 'Stryker was here')
        ], [
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false
        ]);
    });

    test('detects default function and class exports independently', function () {
        assert.deepStrictEqual([
            hasExport('export default function defaultFunction() {}\n', 'default'),
            hasExport('export default function defaultFunction() {}\n', ''),
            hasExport('export default class DefaultClass {}\n', 'default'),
            hasExport('export default class DefaultClass {}\n', '')
        ], [
            true,
            false,
            true,
            false
        ]);
    });

    test('detects direct runtime export forms', function () {
        const content = [
            'const notExported = 0;',
            'export default 1;',
            'export default function defaultFunction() {}',
            'export default class DefaultClass {}',
            'export function functionName() {}',
            'export class ClassName {}',
            'export enum EnumName { A }',
            'export namespace NamespaceName {}',
            'export const { nested: { valueName } } = { nested: { valueName: 1 } };',
            'const localName = 1;',
            'export { localName as publicName };',
            ''
        ]
            .join('\n');

        assert.deepStrictEqual([
            hasExport(content, 'default'),
            hasExport(content, 'functionName'),
            hasExport(content, 'ClassName'),
            hasExport(content, 'EnumName'),
            hasExport(content, 'NamespaceName'),
            hasExport(content, 'valueName'),
            hasExport(content, 'publicName'),
            hasExport(content, 'missing'),
            hasExport(content, 'Stryker was here')
        ], [
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            false,
            false
        ]);
    });

    test('detects declaration-only export forms in declaration mode', function () {
        const content = [
            'export interface InterfaceName {}',
            'export type TypeName = string;',
            'declare const declaredName: string;',
            'export { declaredName };',
            ''
        ]
            .join('\n');

        assert.deepStrictEqual([
            hasExport(content, 'InterfaceName', 'declaration'),
            hasExport(content, 'TypeName', 'declaration'),
            hasExport(content, 'declaredName', 'declaration'),
            hasExport(content, 'InterfaceName', 'runtime')
        ], [
            true,
            true,
            true,
            true
        ]);
    });

    test('resolves namespace, named, aliased, and star re-exports', function () {
        const files = sourceFiles({
            'index.js': [
                'export * as grouped from "./namespace.js";',
                'export { internal as publicName } from "./named.js";',
                'export * from "./star.js";',
                ''
            ]
                .join('\n'),
            'namespace.js': 'export const member = 1;\n',
            'named.js': 'export const internal = 1;\n',
            'star.js': 'export const starName = 1;\nexport default 1;\n'
        });

        assert.deepStrictEqual([
            hasExportThroughGraph(files, 'grouped'),
            hasExportThroughGraph(files, 'member'),
            hasExportThroughGraph(files, 'publicName'),
            hasExportThroughGraph(files, 'internal'),
            hasExportThroughGraph(files, 'starName'),
            hasExportThroughGraph(files, 'default'),
            hasExportThroughGraph(files, 'missing')
        ], [
            true,
            false,
            true,
            false,
            true,
            false,
            false
        ]);
    });

    test('does not resolve local export declarations as re-export targets', function () {
        assert.strictEqual(
            hasDeadCodeEliminationExportedName({
                maximumDepth: 3,
                mode: 'runtime',
                targetPath: 'index.js',
                exportName: 'missing',
                sourceFile: sourceFile('const value = 1;\nexport { value };\n'),
                resolver: {
                    resolve() {
                        assert.fail('Expected local export declarations to stay local');
                    }
                }
            }),
            false
        );
    });

    test('rejects type-only runtime re-exports and unresolved targets', function () {
        const files = sourceFiles({
            'index.js': [
                'export type { Api } from "./types.js";',
                'export { missing } from "./missing.js";',
                'export { assetName } from "./asset.json";',
                'export * from "./asset.json";',
                'export * as ignored from "./asset.json";',
                ''
            ]
                .join('\n'),
            'types.js': 'export type Api = string;\n',
            'asset.json': undefined
        });

        assert.deepStrictEqual([
            hasExportThroughGraph(files, 'Api', 'runtime'),
            hasExportThroughGraph(files, 'Api', 'declaration'),
            hasExportThroughGraph(files, 'missing'),
            hasExportThroughGraph(files, 'assetName'),
            hasExportThroughGraph(files, 'ignored')
        ], [
            false,
            true,
            false,
            false,
            false
        ]);
    });

    test('rejects re-exports from unparsed source targets', function () {
        assert.deepStrictEqual([
            hasExportThroughUnparsedTarget('export { value } from "./target.js";\n', 'value'),
            hasExportThroughUnparsedTarget('export * from "./target.js";\n', 'value')
        ], [
            false,
            false
        ]);
    });

    test('stops on cyclic star re-exports', function () {
        const files = sourceFiles({
            'index.js': 'export * from "./loop.js";\n',
            'loop.js': 'export * from "./index.js";\n'
        });
        const indexSourceFile = files.get('index.js');
        if (indexSourceFile === undefined) {
            assert.fail('Expected index.js source file');
        }
        let resolveCount = 0;

        assert.strictEqual(
            hasDeadCodeEliminationExportedName({
                maximumDepth: 3,
                mode: 'runtime',
                targetPath: 'index.js',
                exportName: 'missing',
                sourceFile: indexSourceFile,
                resolver: {
                    resolve(_importerTargetPath, _resolverMode, specifier) {
                        resolveCount += 1;
                        const targetPath = specifier.replace(/^\.\//u, '');
                        const resolved = files.get(targetPath);
                        return {
                            targetPath,
                            sourceFile: resolved,
                            targetOnly: resolved === undefined
                        };
                    }
                }
            }),
            false
        );
        assert.strictEqual(resolveCount, 2);
    });

    test('honors the maximum export search depth', function () {
        const files = sourceFiles({
            'index.js': 'export { value } from "./leaf.js";\n',
            'leaf.js': 'export const value = 1;\n'
        });
        const indexSourceFile = files.get('index.js');
        if (indexSourceFile === undefined) {
            assert.fail('Expected index.js source file');
        }
        const search = {
            mode: 'runtime' as const,
            targetPath: 'index.js',
            exportName: 'value',
            sourceFile: indexSourceFile,
            resolver: {
                resolve(
                    _importerTargetPath: string,
                    _resolverMode: DeadCodeEliminationExportCheckMode,
                    specifier: string
                ) {
                    const targetPath = specifier.replace(/^\.\//u, '');
                    const resolved = files.get(targetPath);
                    return {
                        targetPath,
                        sourceFile: resolved,
                        targetOnly: resolved === undefined
                    };
                }
            }
        };

        assert.deepStrictEqual([
            hasDeadCodeEliminationExportedName({ ...search, maximumDepth: 0 }),
            hasDeadCodeEliminationExportedName({ ...search, maximumDepth: 1 }),
            hasDeadCodeEliminationExportedName({ ...search, maximumDepth: 2 })
        ], [
            false,
            false,
            true
        ]);
    });
});
