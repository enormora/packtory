import assert from 'node:assert';
import { test } from 'mocha';
import { ModuleKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { getReferencedSourceFiles } from './source-file-references.ts';

test('returns an empty array when the given source file doesn’t has any imports', () => {
    const files = [{ filePath: 'main.ts', content: '' }];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, []);
});

test('returns an empty array when the given source file has only imports to node-builtin modules', () => {
    const files = [{ filePath: 'main.ts', content: 'import fs from "fs";' }];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, []);
});

test('returns an empty array when the given source file has only imports to node-builtin modules prefixed with node protocol', () => {
    const files = [{ filePath: 'main.ts', content: 'import fs from "node:fs/promises";' }];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, []);
});

test('throws when the given source contains an import but it is not resolvable', () => {
    const files = [{ filePath: 'main.ts', content: 'import {foo} from "foo.js"' }];
    const project = createProject({ withFiles: files });

    try {
        getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));
        assert.fail('Expected getReferencedSourceFiles() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to resolve import "foo.js" in file "/main.ts"');
    }
});

test('throws when the given source contains an import to a node-builtin look-a-like module which is actually not a builtin', () => {
    const files = [{ filePath: 'main.ts', content: 'import foo from "node:foo";' }];
    const project = createProject({ withFiles: files });

    try {
        getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));
        assert.fail('Expected getReferencedSourceFiles() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Failed to resolve import "node:foo" in file "/main.ts"');
    }
});

test('returns array with the resolved source file using an import from statement', () => {
    const files = [
        { filePath: 'main.ts', content: 'import {foo} from "./foo"' },
        { filePath: 'foo.ts', content: 'export const foo = "";' }
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using an export from statement', () => {
    const files = [
        { filePath: 'main.ts', content: 'export {foo} from "./foo"' },
        { filePath: 'foo.ts', content: 'export const foo = "";' }
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using CommonJS', () => {
    const files = [
        { filePath: 'main.js', content: 'const foo = require("./foo");' },
        { filePath: 'foo.js', content: 'module.exports = {};' }
    ];
    const project = createProject({ withFiles: files, module: ModuleKind.CommonJS });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.js'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.js')]);
});

test('returns array with the resolved source file using dynamic imports', () => {
    const files = [
        { filePath: 'main.ts', content: 'async function foo() { await import("./foo"); }' },
        { filePath: 'foo.ts', content: '' }
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using type from import', () => {
    const files = [
        { filePath: 'main.ts', content: 'import type { Foo } from "./foo.ts"' },
        { filePath: 'foo.ts', content: '' }
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using type import function', () => {
    const files = [
        { filePath: 'main.ts', content: 'type Foo = import("./foo").Foo' },
        { filePath: 'foo.ts', content: '' }
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using an import statement', () => {
    const files = [
        { filePath: 'main.ts', content: 'import {} from "./foo";' },
        { filePath: 'foo.ts', content: 'parseInt("", 42)' }
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('works with JS files', () => {
    const files = [
        { filePath: 'main.js', content: 'import {} from "./foo";' },
        { filePath: 'foo.js', content: 'parseInt("", 42)' }
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.js'));

    assert.deepStrictEqual(result, [project.getSourceFileOrThrow('foo.js')]);
});
