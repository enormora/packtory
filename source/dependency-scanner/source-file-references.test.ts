import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ModuleKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedSourceFiles, resolveSourceFileForLiteral } from './source-file-references.ts';

suite('source-file-references', function () {
    test('returns an empty array when the given source file doesn’t has any imports', function () {
        const files = [{ filePath: 'main.ts', content: '' }];
        const project = createProject({ withFiles: files });

        const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

        assert.deepStrictEqual(result, []);
    });

    test('returns an empty array when the given source file has only imports to node-builtin modules', function () {
        const files = [{ filePath: 'main.ts', content: 'import fs from "fs";' }];
        const project = createProject({ withFiles: files });

        const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

        assert.deepStrictEqual(result, []);
    });

    test('returns an empty array when the given source file has only imports to node-builtin modules prefixed with node protocol', function () {
        const files = [{ filePath: 'main.ts', content: 'import fs from "node:fs/promises";' }];
        const project = createProject({ withFiles: files });

        const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

        assert.deepStrictEqual(result, []);
    });

    test('throws when the given source contains an import but it is not resolvable', function () {
        const files = [{ filePath: 'main.ts', content: 'import {foo} from "foo.js"' }];
        const project = createProject({ withFiles: files });

        try {
            getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));
            assert.fail('Expected getReferencedSourceFiles() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve import "foo.js" in file "/main.ts"');
        }
    });

    test('throws when the given source contains an import to a node-builtin look-a-like module which is actually not a builtin', function () {
        const files = [{ filePath: 'main.ts', content: 'import foo from "node:foo";' }];
        const project = createProject({ withFiles: files });

        try {
            getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));
            assert.fail('Expected getReferencedSourceFiles() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve import "node:foo" in file "/main.ts"');
        }
    });

    function expectMainResolvesToFoo(
        files: { readonly filePath: string; readonly content: string }[],
        options: { readonly module?: ModuleKind } = {}
    ): void {
        const project = createProject({ withFiles: files, ...options });
        const mainPath = files[0]?.filePath ?? '';
        const fooPath = files[1]?.filePath ?? '';
        const result = getReferencedSourceFiles(project.getSourceFileOrThrow(mainPath));

        assert.deepStrictEqual(result, [project.getSourceFileOrThrow(fooPath)]);
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

        const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

        assert.deepStrictEqual(result, [
            project.getSourceFileOrThrow('foo.ts'),
            project.getSourceFileOrThrow('bar.ts'),
            project.getSourceFileOrThrow('baz.ts')
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
