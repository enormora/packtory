import test from 'ava';
import { createProject } from '../test-libraries/typescript-project.js';
import { replaceImportPaths } from './import-paths.js';

test('returns source code unmodified when it doesn’t contain any import statement that needs to be replaced', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: 'const foo = "bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(sourceFile, replacements);

    t.is(result, 'const foo = "bar";');
});

test('returns the source code unmodified when there are no replacements', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([]);

    const result = replaceImportPaths(sourceFile, replacements);

    t.is(result, 'const foo = "bar"; import "./bar";');
});

test('returns the source code with the modified import statement', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(sourceFile, replacements);

    t.is(result, 'const foo = "bar"; import "replacement";');
});

test('modifies only matching import statements and keeps non-matching statements unchanged', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: 'import "./baz"; import "./bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' },
            { filePath: '/folder/baz.ts', content: 'const baz = "qux";' }
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(sourceFile, replacements);

    t.is(result, 'import "./baz"; import "replacement";');
});

test('modifies import statements correctly in d.ts files', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.d.ts', content: 'import "./bar";' },
            { filePath: '/folder/bar.d.ts', content: 'const bar = "baz";' }
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.d.ts');
    const replacements = new Map<string, string>([['/folder/bar.d.ts', 'replacement']]);

    const result = replaceImportPaths(sourceFile, replacements);

    t.is(result, 'import "replacement";');
});

test('keeps shebang line in the transformed output', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: '#!/usr/bin/env node\nconst foo = "bar"; import "./bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const sourceFile = project.getSourceFileOrThrow('/folder/foo.ts');
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(sourceFile, replacements);

    t.is(result, '#!/usr/bin/env node\nconst foo = "bar"; import "replacement";');
});
