import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ModuleKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedModules, resolveSourceFileForLiteral } from './source-file-references.ts';
import { findPackageOwnedAssetFilePath } from './package-owned-asset-file-path.ts';

const packageJsonPath = '/package.json';

suite('source-file-references', function () {
    function expectResolutionFailure(content: string, expectedMessage: string): void {
        const project = createProject({ withFiles: [{ filePath: 'main.ts', content }] });

        try {
            getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);
            assert.fail('Expected getReferencedModules() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, expectedMessage);
        }
    }

    test('returns an empty array when the given source file doesn’t has any imports', function () {
        const files = [{ filePath: 'main.ts', content: '' }];
        const project = createProject({ withFiles: files });

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, []);
    });

    test('returns an empty array when the given source file has only imports to node-builtin modules', function () {
        const files = [{ filePath: 'main.ts', content: 'import fs from "fs";' }];
        const project = createProject({ withFiles: files });

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, []);
    });

    test('returns an empty array when the given source file has only imports to node-builtin modules prefixed with node protocol', function () {
        const files = [{ filePath: 'main.ts', content: 'import fs from "node:fs/promises";' }];
        const project = createProject({ withFiles: files });

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, []);
    });

    test('throws when the given source contains an import but it is not resolvable', function () {
        expectResolutionFailure('import {foo} from "foo.js"', 'Failed to resolve import "foo.js" in file "/main.ts"');
    });

    test('throws when the given source contains an import to a node-builtin look-a-like module which is actually not a builtin', function () {
        expectResolutionFailure(
            'import foo from "node:foo";',
            'Failed to resolve import "node:foo" in file "/main.ts"'
        );
    });

    test('throws a normal resolution failure for unresolved scoped package imports that are not wasm files', function () {
        expectResolutionFailure('import foo from "@scope";', 'Failed to resolve import "@scope" in file "/main.ts"');
    });

    function expectMainResolvesToFoo(
        files: { readonly filePath: string; readonly content: string }[],
        options: { readonly module?: ModuleKind } = {}
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

        assert.deepStrictEqual(result, [{ kind: 'local-asset', filePath: '/module.wasm' }]);
    }

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
                ].join('\n')
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

        assert.deepStrictEqual(result, [{ kind: 'local-asset', filePath: '/data.json' }]);
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

    test('returns external package references for package-owned json imports', function () {
        const project = createProject({
            withFiles: [
                { filePath: 'main.ts', content: 'import manifest from "foo/package.json" with { type: "json" };' }
            ]
        });
        project.createSourceFile('/node_modules/foo/package.json', '{"name":"foo"}');

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, [{ kind: 'external-package', packageName: 'foo' }]);
    });

    test('returns external package references for package-owned wasm imports', function () {
        const project = createProject({
            withFiles: [{ filePath: 'main.ts', content: 'import module from "foo/module.wasm";' }]
        });
        project.createSourceFile('/node_modules/foo/module.wasm', 'wasm');

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, [{ kind: 'external-package', packageName: 'foo' }]);
    });

    test('returns external package references for package-owned root wasm files', function () {
        const project = createProject({
            withFiles: [{ filePath: 'main.ts', content: 'import module from "foo.wasm";' }]
        });
        project.createSourceFile('/node_modules/foo.wasm', 'wasm');

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, [{ kind: 'external-package', packageName: 'foo.wasm' }]);
    });

    test('resolves package-owned wasm imports by walking up node_modules ancestors', function () {
        const project = createProject({
            withFiles: [{ filePath: '/src/main.ts', content: 'import module from "foo/module.wasm";' }]
        });
        project.createSourceFile('/node_modules/foo/module.wasm', 'wasm');

        const result = getReferencedModules(project.getSourceFileOrThrow('/src/main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, [{ kind: 'external-package', packageName: 'foo' }]);
    });

    test('returns external package references for scoped package-owned wasm imports', function () {
        const project = createProject({
            withFiles: [{ filePath: 'main.ts', content: 'import module from "@scope/foo/module.wasm";' }]
        });
        project.createSourceFile('/node_modules/@scope/foo/module.wasm', 'wasm');

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, [{ kind: 'external-package', packageName: '@scope/foo' }]);
    });

    test('throws when package-owned wasm imports cannot be found in any node_modules ancestor', function () {
        expectResolutionFailure(
            'import module from "foo/module.wasm";',
            'Failed to resolve import "foo/module.wasm" in file "/main.ts"'
        );
    });

    test('throws when nested package-owned wasm imports cannot be found in any node_modules ancestor', function () {
        const project = createProject({
            withFiles: [{ filePath: '/src/main.ts', content: 'import module from "foo/module.wasm";' }]
        });

        assert.throws(() => {
            getReferencedModules(project.getSourceFileOrThrow('/src/main.ts'), packageJsonPath);
        }, /^Error: Failed to resolve import "foo\/module\.wasm" in file "\/src\/main\.ts"$/u);
    });

    test('throws when package-owned scoped wasm imports use an invalid package name', function () {
        expectResolutionFailure('import module from "@scope.wasm";', 'Invalid package specifier "@scope.wasm"');
    });

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

        assert.deepStrictEqual(result, [{ kind: 'external-package', packageName: '@scope/foo' }]);
    });

    test('returns generated manifest references for root package.json imports', function () {
        const project = createProject({
            withFiles: [
                { filePath: 'main.ts', content: 'import manifest from "./package.json" with { type: "json" };' }
            ]
        });
        project.createSourceFile('/package.json', '{"name":"fixture"}');

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, [{ kind: 'generated-manifest', filePath: '/package.json' }]);
    });

    test('findPackageOwnedAssetFilePath() searches the current folder and its ancestors up to root', function () {
        const checkedPaths: string[] = [];

        const result = findPackageOwnedAssetFilePath('foo/module.wasm', '/workspace/src/feature', (candidatePath) => {
            checkedPaths.push(candidatePath);
            return candidatePath === '/node_modules/foo/module.wasm';
        });

        assert.strictEqual(result, '/node_modules/foo/module.wasm');
        assert.deepStrictEqual(checkedPaths, [
            '/workspace/src/feature/node_modules/foo/module.wasm',
            '/workspace/src/node_modules/foo/module.wasm',
            '/workspace/node_modules/foo/module.wasm',
            '/node_modules/foo/module.wasm'
        ]);
    });

    test('findPackageOwnedAssetFilePath() returns undefined when no ancestor contains the asset', function () {
        const result = findPackageOwnedAssetFilePath('foo/module.wasm', '/workspace/src/feature', () => {
            return false;
        });

        assert.strictEqual(result, undefined);
    });

    test('findPackageOwnedAssetFilePath() checks the root folder only once', function () {
        const checkedPaths: string[] = [];

        const result = findPackageOwnedAssetFilePath('foo/module.wasm', '/', (candidatePath) => {
            checkedPaths.push(candidatePath);
            return false;
        });

        assert.strictEqual(result, undefined);
        assert.deepStrictEqual(checkedPaths, ['/node_modules/foo/module.wasm']);
    });

    test('throws when a local wasm import cannot be found on disk', function () {
        expectResolutionFailure(
            'import module from "./missing.wasm";',
            'Failed to resolve import "./missing.wasm" in file "/main.ts"'
        );
    });

    test('classifies resolved local files outside the project as local code', function () {
        const project = createProject({
            withFiles: [{ filePath: 'main.ts', content: 'import value from "./value.js";' }]
        });
        project.createSourceFile('/value.js', 'export default 1;');

        const result = getReferencedModules(project.getSourceFileOrThrow('main.ts'), packageJsonPath);

        assert.deepStrictEqual(result, [{ kind: 'local-code', filePath: '/value.js' }]);
    });

    function resolveFirstImportLiteral(files: { readonly filePath: string; readonly content: string }[]): {
        readonly project: ReturnType<typeof createProject>;
        readonly result: ReturnType<typeof resolveSourceFileForLiteral>;
    } {
        const project = createProject({ withFiles: files });
        const sourceFile = project.getSourceFileOrThrow('main.ts');
        const [literal] = sourceFile.getImportStringLiterals();
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
