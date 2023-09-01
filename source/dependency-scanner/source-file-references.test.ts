import {test} from 'node:test';
import assert from 'node:assert';
import {getReferencedSourceFiles} from './source-file-references.js';
import {ModuleKind, ModuleResolutionKind, Project, ScriptTarget} from 'ts-morph';

interface FileDescription {
    filePath: string;
    content: string;
}

interface Options {
    withFiles?: FileDescription[];
    module?: ModuleKind;
}

function createProject(options: Options = {}): Project {
    const {withFiles = [], module = ModuleKind.Node16} = options;
    const project = new Project({
        compilerOptions: {
            allowJs: true,
            module,
            esModuleInterop: true,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node10
        },
        useInMemoryFileSystem: true,
    });

    for (const file of withFiles) {
        project.createSourceFile(file.filePath, file.content);
    }

    return project;
}

test('returns an empty array when the given source file doesn’t has any imports', () => {
    const files = [ {filePath: 'main.ts', content: ''} ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, []);
});

test('returns an empty array when the given source contains an import but it is not resolvable', () => {
    const files = [ {filePath: 'main.ts', content: 'import {foo} from "foo.js"'} ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, []);
});

test('returns array with the resolved source file using an import from statement', () => {
    const files = [
        {filePath: 'main.ts', content: 'import {foo} from "./foo"'},
        {filePath: 'foo.ts', content: 'export const foo = "";'}
    ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.ts') ]);
});

test('returns array with the resolved source file using an export from statement', () => {
    const files = [
        {filePath: 'main.ts', content: 'export {foo} from "./foo"'},
        {filePath: 'foo.ts', content: 'export const foo = "";'}
    ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.ts') ]);
});

test('returns array with the resolved source file using CommonJS', () => {
    const files = [
        {filePath: 'main.js', content: 'const foo = require("./foo");'},
        {filePath: 'foo.js', content: 'module.exports = {};'}
    ];
    const project = createProject({withFiles: files, module: ModuleKind.CommonJS});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.js'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.js') ]);
});

test('returns array with the resolved source file using dynamic imports', () => {
    const files = [
        {filePath: 'main.ts', content: 'async function foo() { await import("./foo"); }'},
        {filePath: 'foo.ts', content: ''}
    ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.ts') ]);
});

test('returns array with the resolved source file using type from import', () => {
    const files = [
        {filePath: 'main.ts', content: 'import type { Foo } from "./foo.ts"'},
        {filePath: 'foo.ts', content: ''}
    ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.ts') ]);
});

test('returns array with the resolved source file using type import function', () => {
    const files = [
        {filePath: 'main.ts', content: 'type Foo = import("./foo").Foo'},
        {filePath: 'foo.ts', content: ''}
    ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.ts') ]);
});



test('returns array with the resolved source file using an import statement', () => {
    const files = [
        {filePath: 'main.ts', content: 'import {} from "./foo";'},
        {filePath: 'foo.ts', content: 'parseInt("", 42)'}
    ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.ts'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.ts') ]);
});

test('works with JS files', () => {
    const files = [
        {filePath: 'main.js', content: 'import {} from "./foo";'},
        {filePath: 'foo.js', content: 'parseInt("", 42)'}
    ];
    const project = createProject({withFiles: files});

    const result = getReferencedSourceFiles(project.getSourceFileOrThrow('main.js'));

    assert.deepStrictEqual(result, [ project.getSourceFileOrThrow('foo.js') ]);
});
