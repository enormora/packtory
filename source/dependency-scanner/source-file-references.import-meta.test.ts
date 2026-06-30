import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedModules, resolveSourceFileForLiteral } from './source-file-references.ts';
import { findPackageOwnedAssetFilePath } from './package-owned-asset-file-path.ts';

const packageJsonPath = '/package.json';

type SourceFileFixture = {
    readonly filePath: string;
    readonly content: string;
};

type ExpectedImportMetaReference = {
    readonly kind: string;
    readonly filePath?: string;
    readonly packageName?: string;
};

type ImportMetaResolveExpectation = {
    readonly mainContent: string;
    readonly extraFiles?: readonly SourceFileFixture[];
    readonly expected: readonly ExpectedImportMetaReference[];
};

type ResolvedImportLiteral = {
    readonly project: ReturnType<typeof createProject>;
    readonly result: ReturnType<typeof resolveSourceFileForLiteral>;
};

function expectResolutionFailure(content: string, expectedMessage: string): void {
    const project = createProject({ withFiles: [ { filePath: 'main.ts', content } ] });

    try {
        getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
        assert.fail('Expected getReferencedModules() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

suite('source-file-references import.meta and package assets', function () {
    suite('package-owned assets', function () {
        test('findPackageOwnedAssetFilePath() searches the current folder and its ancestors up to root', function () {
            const checkedPaths: string[] = [];

            const result = findPackageOwnedAssetFilePath(
                'foo/module.wasm',
                '/workspace/src/feature',
                function (candidatePath) {
                    checkedPaths.push(candidatePath);
                    return candidatePath === '/node_modules/foo/module.wasm';
                }
            );

            assert.strictEqual(result, '/node_modules/foo/module.wasm');
            assert.deepStrictEqual(checkedPaths, [
                '/workspace/src/feature/node_modules/foo/module.wasm',
                '/workspace/src/node_modules/foo/module.wasm',
                '/workspace/node_modules/foo/module.wasm',
                '/node_modules/foo/module.wasm'
            ]);
        });

        test('findPackageOwnedAssetFilePath() returns undefined when no ancestor contains the asset', function () {
            const result = findPackageOwnedAssetFilePath('foo/module.wasm', '/workspace/src/feature', function () {
                return false;
            });

            assert.strictEqual(result, undefined);
        });

        test('findPackageOwnedAssetFilePath() checks the root folder only once', function () {
            const checkedPaths: string[] = [];

            const result = findPackageOwnedAssetFilePath('foo/module.wasm', '/', function (candidatePath) {
                checkedPaths.push(candidatePath);
                return false;
            });

            assert.strictEqual(result, undefined);
            assert.deepStrictEqual(checkedPaths, [ '/node_modules/foo/module.wasm' ]);
        });

        test('throws when a local wasm import cannot be found on disk', function () {
            expectResolutionFailure(
                'import module from "./missing.wasm";',
                'Failed to resolve import "./missing.wasm" in file "/main.ts"'
            );
        });

        test('throws when a local non-wasm import exists on disk but is not resolvable as a module', function () {
            const project = createProject({
                withFiles: [ { filePath: 'main.ts', content: 'import data from "./module.bin";' } ]
            });
            project.createSourceFile('/module.bin', 'binary');

            assert.throws(function () {
                getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
            }, /^Error: Failed to resolve import "\.\/module\.bin" in file "\/main\.ts"$/u);
        });

        test('classifies resolved local files outside the project as local code', function () {
            const project = createProject({
                withFiles: [ { filePath: 'main.ts', content: 'import value from "./value.js";' } ]
            });
            project.createSourceFile('/value.js', 'export default 1;');

            const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

            assert.deepStrictEqual(result, [ { kind: 'local-code', filePath: '/value.js' } ]);
        });
    });

    suite('import.meta.resolve references', function () {
        function expectImportMetaResolveReferences(args: ImportMetaResolveExpectation): void {
            const project = createProject({
                withFiles: [ { filePath: 'main.ts', content: args.mainContent } ]
            });
            const extraFiles = args.extraFiles ?? [];
            for (const file of extraFiles) {
                project.createSourceFile(file.filePath, file.content);
            }
            const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
            assert.deepStrictEqual(result, args.expected);
        }

        suite('resolved references', function () {
            test('returns local code references for import.meta.resolve() pointing at a sibling source file', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'const url = import.meta.resolve("./foo");',
                    extraFiles: [ { filePath: 'foo.ts', content: 'export const foo = "";' } ],
                    expected: [ { kind: 'local-code', filePath: '/foo.ts' } ]
                });
            });

            test('returns local asset references for import.meta.resolve() pointing at a json file', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'const url = import.meta.resolve("./data.json");',
                    extraFiles: [ { filePath: 'data.json', content: '{"ok":true}' } ],
                    expected: [ { kind: 'local-asset', filePath: '/data.json' } ]
                });
            });

            test('returns local asset references for import.meta.resolve() pointing at a relative wasm file', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'const url = import.meta.resolve("./module.wasm");',
                    extraFiles: [ { filePath: '/module.wasm', content: 'wasm' } ],
                    expected: [ { kind: 'local-asset', filePath: '/module.wasm' } ]
                });
            });

            test('returns external package references for import.meta.resolve() pointing at a bare specifier', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'const url = import.meta.resolve("foo");',
                    extraFiles: [
                        {
                            filePath: '/node_modules/foo/index.d.ts',
                            content: 'declare const foo: string; export default foo;'
                        }
                    ],
                    expected: [ { kind: 'external-package', packageName: 'foo' } ]
                });
            });

            test('returns external package references for import.meta.resolve() pointing at a package-owned asset', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'const url = import.meta.resolve("foo/module.wasm");',
                    extraFiles: [ { filePath: '/node_modules/foo/module.wasm', content: 'wasm' } ],
                    expected: [ { kind: 'external-package', packageName: 'foo' } ]
                });
            });

            test('ignores import.meta.resolve() pointing at a node-builtin module', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'const url = import.meta.resolve("node:fs");',
                    expected: []
                });
            });
        });

        suite('invalid arguments', function () {
            test('throws when import.meta.resolve() receives a non-literal argument', function () {
                expectResolutionFailure(
                    'const specifier = "./foo"; const url = import.meta.resolve(specifier);',
                    'Invalid import.meta.resolve() usage in file "/main.ts": only a single static string literal argument is supported'
                );
            });

            test('throws when import.meta.resolve() receives a template literal argument', function () {
                expectResolutionFailure(
                    'const url = import.meta.resolve(`./foo`);',
                    'Invalid import.meta.resolve() usage in file "/main.ts": only a single static string literal argument is supported'
                );
            });

            test('throws when import.meta.resolve() receives no arguments', function () {
                expectResolutionFailure(
                    'const url = import.meta.resolve();',
                    'Invalid import.meta.resolve() usage in file "/main.ts": only a single static string literal argument is supported'
                );
            });

            test('throws when import.meta.resolve() receives multiple arguments', function () {
                expectResolutionFailure(
                    'const url = import.meta.resolve("./foo", "./parent");',
                    'Invalid import.meta.resolve() usage in file "/main.ts": only a single static string literal argument is supported'
                );
            });

            test('throws when an import.meta.resolve() specifier is not resolvable', function () {
                expectResolutionFailure(
                    'const url = import.meta.resolve("missing-package");',
                    'Failed to resolve import "missing-package" in file "/main.ts"'
                );
            });
        });

        suite('ignored receivers', function () {
            test('does not pick up unrelated import.meta member accesses', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'const here = import.meta.url;',
                    expected: []
                });
            });

            test('does not pick up call expressions on import.meta members other than resolve', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'function callOther() { return import.meta.foo("./bar"); }',
                    expected: []
                });
            });

            test('does not pick up resolve() calls on non-import meta properties', function () {
                expectImportMetaResolveReferences({
                    mainContent: 'class Subject { constructor() { new.target?.resolve("./bar"); } } void Subject;',
                    expected: []
                });
            });

            test('does not pick up resolve() calls whose receiver is not a meta property', function () {
                expectImportMetaResolveReferences({
                    mainContent: [
                        'const helper = { resolve(specifier: string) { return specifier; } };',
                        'helper.resolve("./bar");'
                    ]
                        .join('\n'),
                    expected: []
                });
            });
        });

        test('collects references from regular imports and import.meta.resolve() calls in the same file', function () {
            expectImportMetaResolveReferences({
                mainContent: [
                    'import { foo } from "./foo";',
                    'const url = import.meta.resolve("./bar");',
                    'void foo;'
                ]
                    .join('\n'),
                extraFiles: [
                    { filePath: 'foo.ts', content: 'export const foo = 1;' },
                    { filePath: 'bar.ts', content: 'export const bar = 2;' }
                ],
                expected: [
                    { kind: 'local-code', filePath: '/foo.ts' },
                    { kind: 'local-code', filePath: '/bar.ts' }
                ]
            });
        });
    });

    suite('literal resolution', function () {
        function resolveFirstImportLiteral(files: readonly SourceFileFixture[]): ResolvedImportLiteral {
            const project = createProject({ withFiles: files });
            const sourceFile = project.getSourceFileOrThrow('main.ts');
            const [ literal ] = sourceFile.getImportStringLiterals();
            if (literal === undefined) {
                assert.fail('Expected an import literal to exist');
            }
            return { project, result: resolveSourceFileForLiteral(literal, sourceFile) };
        }

        test('resolveSourceFileForLiteral() returns undefined when ts cannot resolve the module', function () {
            const { result } = resolveFirstImportLiteral([
                { filePath: 'main.ts', content: 'import {} from "not-resolved";' }
            ]);

            assert.strictEqual(result, undefined);
        });

        test('resolveSourceFileForLiteral() resolves dynamic import literals directly', function () {
            const { project, result } = resolveFirstImportLiteral([
                { filePath: 'main.ts', content: 'async function load() { return import("./foo"); }' },
                { filePath: 'foo.ts', content: 'export const foo = 1;' }
            ]);

            assert.strictEqual(result, project.getSourceFileOrThrow('foo.ts'));
        });
    });
});
