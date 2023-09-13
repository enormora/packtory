import {test} from 'node:test';
import assert from 'node:assert';
import {replaceImportPaths} from './import-paths.js';
import {createProject} from '../test-libraries/typescript-project.js';

test('returns the source code unmodified when it doesn’t contain any import statement that needs to be replaced', () => {
    const project = createProject({
        withFiles: [
            {filePath: '/folder/foo.ts', content: 'const foo = "bar";'},
            {filePath: '/folder/bar.ts', content: 'const bar = "baz";'}
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([ [ '/folder/bar.ts', 'replacement' ] ]);

    const result = replaceImportPaths(sourceFile, replacements, false);

    assert.strictEqual(result, 'const foo = "bar";');
});

test('returns the source code unmodified when there are no replacements', () => {
    const project = createProject({
        withFiles: [
            {filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";'},
            {filePath: '/folder/bar.ts', content: 'const bar = "baz";'}
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([]);

    const result = replaceImportPaths(sourceFile, replacements, false);

    assert.strictEqual(result, 'const foo = "bar"; import "./bar";');
});

test('returns the source code with the modfied import statement', () => {
    const project = createProject({
        withFiles: [
            {filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";'},
            {filePath: '/folder/bar.ts', content: 'const bar = "baz";'}
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([ [ '/folder/bar.ts', 'replacement' ] ]);

    const result = replaceImportPaths(sourceFile, replacements, false);

    assert.strictEqual(result, 'const foo = "bar"; import "replacement";');
});

test('modifies only matching importstatements and keeps non-matching statements unchanged', () => {
    const project = createProject({
        withFiles: [
            {filePath: '/folder/foo.ts', content: 'import "./baz"; import "./bar";'},
            {filePath: '/folder/bar.ts', content: 'const bar = "baz";'},
            {filePath: '/folder/baz.ts', content: 'const baz = "qux";'}
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([ [ '/folder/bar.ts', 'replacement' ] ]);

    const result = replaceImportPaths(sourceFile, replacements, false);

    assert.strictEqual(result, 'import "./baz"; import "replacement";');
});

test('doesn’t modify import statements in d.ts files when resolving d.ts files is disabled', () => {
    const project = createProject({
        withFiles: [
            {filePath: '/folder/foo.d.ts', content: 'import "./bar";'},
            {filePath: '/folder/bar.d.ts', content: 'const bar = "baz";'},
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.d.ts');
    const replacements = new Map<string, string>([ [ '/folder/bar.d.ts', 'replacement' ] ]);

    const result = replaceImportPaths(sourceFile, replacements, false);

    assert.strictEqual(result, 'import "./bar";');
});

test('modifies import statements correctly in d.ts files when resolving d.ts files is enabled', () => {
    const project = createProject({
        withFiles: [
            {filePath: '/folder/foo.d.ts', content: 'import "./bar";'},
            {filePath: '/folder/bar.d.ts', content: 'const bar = "baz";'},
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.d.ts');
    const replacements = new Map<string, string>([ [ '/folder/bar.d.ts', 'replacement' ] ]);

    const result = replaceImportPaths(sourceFile, replacements, true);

    assert.strictEqual(result, 'import "replacement";');
});



