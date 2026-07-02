import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedModules } from './source-file-references.ts';

const packageJsonPath = '/package.json';

type SourceFileFixture = {
    readonly filePath: string;
    readonly content: string;
};

type ResolutionOptions = {
    readonly module?: ModuleKind;
};

function expectReferencesToThrow(project: Project, filePath: string, expectedError: RegExp): void {
    assert.throws(function () {
        getReferencedModules(project.getSourceFileOrThrow(filePath), packageJsonPath);
    }, expectedError);
}

suite('source-file-references', function () {
    function expectResolutionFailure(content: string, expectedMessage: string): void {
        const project = createProject({ withFiles: [ { filePath: 'main.ts', content } ] });

        try {
            getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
            assert.fail('Expected getReferencedModules() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, expectedMessage);
        }
    }

    suite('empty and failing imports', function () {
        test('returns an empty array when the given source file doesn’t has any imports', function () {
            const files = [ { filePath: 'main.ts', content: '' } ];
            const project = createProject({ withFiles: files });

            const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

            assert.deepStrictEqual(result, []);
        });

        test('returns an empty array when the given source file has only imports to node-builtin modules', function () {
            const files = [ { filePath: 'main.ts', content: 'import fs from "fs";' } ];
            const project = createProject({ withFiles: files });

            const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

            assert.deepStrictEqual(result, []);
        });

        test('returns an empty array when the given source file has only imports to node-builtin modules prefixed with node protocol', function () {
            const files = [ { filePath: 'main.ts', content: 'import fs from "node:fs/promises";' } ];
            const project = createProject({ withFiles: files });

            const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

            assert.deepStrictEqual(result, []);
        });

        test('throws when the given source contains an import but it is not resolvable', function () {
            expectResolutionFailure(
                'import {foo} from "foo.js"',
                'Failed to resolve import "foo.js" in file "/main.ts"'
            );
        });

        test('throws when the given source contains an import to a node-builtin look-a-like module which is actually not a builtin', function () {
            expectResolutionFailure(
                'import foo from "node:foo";',
                'Failed to resolve import "node:foo" in file "/main.ts"'
            );
        });

        test('throws a normal resolution failure for unresolved scoped package imports that are not wasm files', function () {
            expectResolutionFailure(
                'import foo from "@scope";',
                'Failed to resolve import "@scope" in file "/main.ts"'
            );
        });
    });

    function expectMainResolvesToFoo(
        files: readonly SourceFileFixture[],
        options: ResolutionOptions = {}
    ): void {
        const project = createProject({ withFiles: files, ...options });
        const mainPath = files[0]?.filePath ?? '';
        const fooPath = files[1]?.filePath ?? '';
        const result = getReferencedModules(project.getSourceFileOrThrow(mainPath), packageJsonPath);

        assert.deepStrictEqual(result, [
            { kind: 'local-code', filePath: project.getSourceFileOrThrow(fooPath).getFilePath() }
        ]);
    }

    function expectLocalWasmReference(importerPath: string, importValue: string): void {
        const project = createProject({
            withFiles: [
                { filePath: importerPath, content: `import module from "${importValue}";` },
                { filePath: '/module.wasm', content: 'wasm' }
            ]
        });

        const result = getReferencedModules(project.getSourceFileOrThrow(importerPath), packageJsonPath);

        assert.deepStrictEqual(result, [ { kind: 'local-asset', filePath: '/module.wasm' } ]);
    }

    function createNode16Project(files: readonly SourceFileFixture[]): Project {
        const project = new Project({
            compilerOptions: {
                allowJs: true,
                module: ModuleKind.Node16,
                esModuleInterop: true,
                noLib: true,
                target: ScriptTarget.ES2022,
                moduleResolution: ModuleResolutionKind.Node16,
                resolveJsonModule: true,
                types: []
            },
            skipLoadingLibFiles: true,
            useInMemoryFileSystem: true
        });

        for (const file of files) {
            project.createSourceFile(file.filePath, file.content);
        }

        return project;
    }

    suite('local code references', function () {
        test('returns array with the resolved source file using an import from statement', function () {
            expectMainResolvesToFoo([
                { filePath: 'main.ts', content: 'import {foo} from "./foo"' },
                { filePath: 'foo.ts', content: 'export const foo = "";' }
            ]);
        });

        test('returns array with the resolved source file using an export from statement', function () {
            expectMainResolvesToFoo([
                { filePath: 'main.ts', content: 'export {foo} from "./foo"' },
                { filePath: 'foo.ts', content: 'export const foo = "";' }
            ]);
        });

        test('returns array with the resolved source file using CommonJS', function () {
            expectMainResolvesToFoo(
                [
                    { filePath: 'main.js', content: 'const foo = require("./foo");' },
                    { filePath: 'foo.js', content: 'module.exports = {};' }
                ],
                { module: ModuleKind.CommonJS }
            );
        });

        test('returns array with the resolved source file using import equals syntax', function () {
            expectMainResolvesToFoo(
                [
                    { filePath: 'main.ts', content: 'import foo = require("./foo");' },
                    { filePath: 'foo.ts', content: 'export const foo = "";' }
                ],
                { module: ModuleKind.CommonJS }
            );
        });

        test('returns array with the resolved source file using a parent-relative import statement', function () {
            expectMainResolvesToFoo([
                { filePath: '/src/main.ts', content: 'import { foo } from "../foo";' },
                { filePath: '/foo.ts', content: 'export const foo = "";' }
            ]);
        });

        test('returns array with the resolved source file using dynamic imports', function () {
            expectMainResolvesToFoo([
                { filePath: 'main.ts', content: 'async function foo() { await import("./foo"); }' },
                { filePath: 'foo.ts', content: '' }
            ]);
        });

        test('returns array with the resolved source file using type from import', function () {
            expectMainResolvesToFoo([
                { filePath: 'main.ts', content: 'import type { Foo } from "./foo.ts"' },
                { filePath: 'foo.ts', content: '' }
            ]);
        });

        test('returns array with the resolved source file using type import function', function () {
            expectMainResolvesToFoo([
                { filePath: 'main.ts', content: 'type Foo = import("./foo").Foo' },
                { filePath: 'foo.ts', content: '' }
            ]);
        });

        test('returns array with the resolved source file using multiple import styles in one file', function () {
            const files = [
                {
                    filePath: 'main.ts',
                    content: [
                        'import { foo } from "./foo";',
                        'export { bar } from "./bar";',
                        'type Baz = import("./baz").Baz;',
                        'void foo;'
                    ]
                        .join('\n')
                },
                { filePath: 'foo.ts', content: 'export const foo = 1;' },
                { filePath: 'bar.ts', content: 'export const bar = 2;' },
                { filePath: 'baz.ts', content: 'export type Baz = string;' }
            ];
            const project = createProject({ withFiles: files });

            const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

            assert.deepStrictEqual(result, [
                { kind: 'local-code', filePath: project.getSourceFileOrThrow('foo.ts').getFilePath() },
                { kind: 'local-code', filePath: project.getSourceFileOrThrow('bar.ts').getFilePath() },
                { kind: 'local-code', filePath: project.getSourceFileOrThrow('baz.ts').getFilePath() }
            ]);
        });
    });

    suite('node16 and local assets', function () {
        test('returns array with the resolved source file using an import statement', function () {
            expectMainResolvesToFoo([
                { filePath: 'main.ts', content: 'import {} from "./foo";' },
                { filePath: 'foo.ts', content: 'parseInt("", 42)' }
            ]);
        });

        test('works with JS files', function () {
            expectMainResolvesToFoo([
                { filePath: 'main.js', content: 'import {} from "./foo";' },
                { filePath: 'foo.js', content: 'parseInt("", 42)' }
            ]);
        });

        test('returns local asset references for json imports with import attributes', function () {
            const project = createProject({
                withFiles: [
                    { filePath: 'main.ts', content: 'import data from "./data.json" with { type: "json" };' },
                    { filePath: 'data.json', content: '{"ok":true}' }
                ]
            });

            const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

            assert.deepStrictEqual(result, [ { kind: 'local-asset', filePath: '/data.json' } ]);
        });

        test('returns local asset references for wasm imports', function () {
            expectLocalWasmReference('main.ts', './module.wasm');
        });

        test('returns local asset references for parent-relative wasm imports', function () {
            expectLocalWasmReference('/src/main.ts', '../module.wasm');
        });

        test('returns local asset references for absolute wasm imports', function () {
            expectLocalWasmReference('/src/main.ts', '/module.wasm');
        });
    });

    suite('package assets and dependencies', function () {
        suite('package-owned assets', function () {
            test('returns external package references for package-owned json imports', function () {
                const project = createProject({
                    withFiles: [
                        {
                            filePath: 'main.ts',
                            content: 'import manifest from "foo/package.json" with { type: "json" };'
                        }
                    ]
                });
                project.createSourceFile('/node_modules/foo/package.json', '{"name":"foo"}');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: 'foo' } ]);
            });

            test('returns external package references for package-owned wasm imports', function () {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: 'import module from "foo/module.wasm";' } ]
                });
                project.createSourceFile('/node_modules/foo/module.wasm', 'wasm');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: 'foo' } ]);
            });
        });

        suite('node_modules packages', function () {
            test('returns external package references for resolved unscoped node_modules imports', function () {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: 'import foo from "foo";' } ]
                });
                project.createSourceFile(
                    '/node_modules/foo/index.d.ts',
                    'declare const foo: string; export default foo;'
                );

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: 'foo' } ]);
            });

            test('returns external package references for declaration imports resolved through @types packages', function () {
                const project = createNode16Project([ {
                    filePath: 'main.d.ts',
                    content: 'export type { Foo } from "foo";'
                } ]);
                project.createDirectory('/node_modules');
                project.createDirectory('/node_modules/@types');
                project.createDirectory('/node_modules/@types/foo');
                project.createSourceFile('/node_modules/@types/foo/index.d.ts', 'export type Foo = string;');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.d.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: '@types/foo' } ]);
            });

            test('returns the imported package name for source files resolved through @types packages', function () {
                const project = createNode16Project([ {
                    filePath: 'main.ts',
                    content: 'import foo from "foo";\nvoid foo;'
                } ]);
                project.createDirectory('/node_modules');
                project.createDirectory('/node_modules/@types');
                project.createDirectory('/node_modules/@types/foo');
                project.createSourceFile(
                    '/node_modules/@types/foo/index.d.ts',
                    'declare const foo: string; export default foo;'
                );

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: 'foo' } ]);
            });

            test('returns external package references for declaration imports resolved outside @types packages', function () {
                const project = createNode16Project([ {
                    filePath: 'main.d.ts',
                    content: 'export type { Foo } from "foo";'
                } ]);
                project.createDirectory('/node_modules/foo');
                project.createSourceFile('/node_modules/foo/index.d.ts', 'export type Foo = string;');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.d.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: 'foo' } ]);
            });
        });

        suite('package-owned wasm assets', function () {
            test('returns external package references for package-owned root wasm files', function () {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: 'import module from "foo.wasm";' } ]
                });
                project.createSourceFile('/node_modules/foo.wasm', 'wasm');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: 'foo.wasm' } ]);
            });

            test('resolves package-owned wasm imports by walking up node_modules ancestors', function () {
                const project = createProject({
                    withFiles: [ { filePath: '/src/main.ts', content: 'import module from "foo/module.wasm";' } ]
                });
                project.createSourceFile('/node_modules/foo/module.wasm', 'wasm');

                const result = getReferencedModules(project.getSourceFileOrThrow('/src/main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: 'foo' } ]);
            });

            test('returns external package references for scoped package-owned wasm imports', function () {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: 'import module from "@scope/foo/module.wasm";' } ]
                });
                project.createSourceFile('/node_modules/@scope/foo/module.wasm', 'wasm');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: '@scope/foo' } ]);
            });
        });

        suite('scoped packages', function () {
            test('returns external package references for resolved scoped node_modules imports', function () {
                const project = createProject({
                    withFiles: [ { filePath: 'main.ts', content: 'import foo from "@scope/foo";' } ]
                });
                project.createSourceFile(
                    '/node_modules/@scope/foo/index.d.ts',
                    'declare const foo: string; export default foo;'
                );

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: '@scope/foo' } ]);
            });
        });

        suite('asset failures', function () {
            test('throws when package-owned wasm imports cannot be found in any node_modules ancestor', function () {
                expectResolutionFailure(
                    'import module from "foo/module.wasm";',
                    'Failed to resolve import "foo/module.wasm" in file "/main.ts"'
                );
            });

            test('throws when nested package-owned wasm imports cannot be found in any node_modules ancestor', function () {
                const project = createProject({
                    withFiles: [ { filePath: '/src/main.ts', content: 'import module from "foo/module.wasm";' } ]
                });

                expectReferencesToThrow(
                    project,
                    '/src/main.ts',
                    /^Error: Failed to resolve import "foo\/module\.wasm" in file "\/src\/main\.ts"$/u
                );
            });

            test('throws when package-owned scoped wasm imports use an invalid package name', function () {
                expectResolutionFailure('import module from "@scope.wasm";', 'Invalid package specifier "@scope.wasm"');
            });
        });

        suite('package manifests', function () {
            test('returns external package references for scoped package-owned json imports', function () {
                const project = createProject({
                    withFiles: [
                        {
                            filePath: 'main.ts',
                            content: 'import manifest from "@scope/foo/package.json" with { type: "json" };'
                        }
                    ]
                });
                project.createSourceFile('/node_modules/@scope/foo/package.json', '{"name":"@scope/foo"}');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'external-package', packageName: '@scope/foo' } ]);
            });

            test('returns generated manifest references for root package.json imports', function () {
                const project = createProject({
                    withFiles: [
                        { filePath: 'main.ts', content: 'import manifest from "./package.json" with { type: "json" };' }
                    ]
                });
                project.createSourceFile('/package.json', '{"name":"fixture"}');

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'generated-manifest', filePath: '/package.json' } ]);
            });

            test('returns local code references for package.json imports resolved inside the package', function () {
                const project = createNode16Project([
                    { filePath: 'main.ts', content: 'import { shared } from "#shared";' },
                    { filePath: 'shared.ts', content: 'export const shared = 1;' },
                    {
                        filePath: 'package.json',
                        content: JSON.stringify({
                            type: 'module',
                            imports: {
                                '#shared': './shared.ts'
                            }
                        })
                    }
                ]);

                const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

                assert.deepStrictEqual(result, [ { kind: 'local-code', filePath: '/shared.ts' } ]);
            });
        });
    });
});
