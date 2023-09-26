import test from 'ava';
import { getReferencedSourceFiles } from './source-file-references.js';
import { createProject } from '../test-libraries/typescript-project.js';
import { ModuleKind } from 'ts-morph';

test('returns an empty array when the given source file doesn’t has any imports', (t) => {
    const files = [{ filePath: 'main.ts', content: '' }];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    t.deepEqual(result, []);
});

test('throws when the given source contains an import but it is not resolvable', (t) => {
    const files = [{ filePath: 'main.ts', content: 'import {foo} from "foo.js"' }];
    const project = createProject({ withFiles: files });

    t.throws(() => getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts')), { message: 'Failed to resolve file for import "foo.js" in containing file "/main.ts"' });
});

test('returns array with the resolved source file using an import from statement', (t) => {
    const files = [
        { filePath: 'main.ts', content: 'import {foo} from "./foo"' },
        { filePath: 'foo.ts', content: 'export const foo = "";' },
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using an export from statement', (t) => {
    const files = [
        { filePath: 'main.ts', content: 'export {foo} from "./foo"' },
        { filePath: 'foo.ts', content: 'export const foo = "";' },
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using CommonJS', (t) => {
    const files = [
        { filePath: 'main.js', content: 'const foo = require("./foo");' },
        { filePath: 'foo.js', content: 'module.exports = {};' },
    ];
    const project = createProject({ withFiles: files, module: ModuleKind.CommonJS });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.js'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.js')]);
});

test('returns array with the resolved source file using dynamic imports', (t) => {
    const files = [
        { filePath: 'main.ts', content: 'async function foo() { await import("./foo"); }' },
        { filePath: 'foo.ts', content: '' },
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using type from import', (t) => {
    const files = [
        { filePath: 'main.ts', content: 'import type { Foo } from "./foo.ts"' },
        { filePath: 'foo.ts', content: '' },
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using type import function', (t) => {
    const files = [
        { filePath: 'main.ts', content: 'type Foo = import("./foo").Foo' },
        { filePath: 'foo.ts', content: '' },
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('returns array with the resolved source file using an import statement', (t) => {
    const files = [
        { filePath: 'main.ts', content: 'import {} from "./foo";' },
        { filePath: 'foo.ts', content: 'parseInt("", 42)' },
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.ts')]);
});

test('works with JS files', (t) => {
    const files = [
        { filePath: 'main.js', content: 'import {} from "./foo";' },
        { filePath: 'foo.js', content: 'parseInt("", 42)' },
    ];
    const project = createProject({ withFiles: files });

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.js'));

    t.deepEqual(result, [project.getSourceFileOrThrow('foo.js')]);
});
