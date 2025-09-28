import test from 'ava';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { replaceImportPaths } from './import-paths.ts';

test('returns source code unmodified when project is undefined', (t) => {
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(undefined, '/folder/foo.ts', 'const foo = "bar"; import "./bar";', replacements);

    t.is(result, 'const foo = "bar"; import "./bar";');
});

test('returns source code unmodified when there is no matching file in the given project', (t) => {
    const project = createProject({
        withFiles: [{ filePath: '/folder/bar.ts', content: 'const bar = "baz";' }]
    });
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(project, '/folder/foo.ts', 'const foo = "bar"; import "./bar";', replacements);

    t.is(result, 'const foo = "bar"; import "./bar";');
});

test('returns source code unmodified when it doesn’t contain any import statement that needs to be replaced', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: 'const foo = "bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(project, '/folder/foo.ts', 'const foo = "bar";', replacements);

    t.is(result, 'const foo = "bar";');
});

test('returns the source code unmodified when there are no replacements', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const replacements = new Map<string, string>([]);

    const result = replaceImportPaths(project, '/folder/foo.ts', 'const foo = "bar"; import "./bar";', replacements);

    t.is(result, 'const foo = "bar"; import "./bar";');
});

test('returns the source code with the modified import statement', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(project, '/folder/foo.ts', 'const foo = "bar"; import "./bar";', replacements);

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
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(project, '/folder/foo.ts', 'import "./baz"; import "./bar";', replacements);

    t.is(result, 'import "./baz"; import "replacement";');
});

test('modifies import statements correctly in d.ts files', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.d.ts', content: 'import "./bar.js";' },
            { filePath: '/folder/bar.d.ts', content: 'const bar = "baz";' }
        ]
    });
    const replacements = new Map<string, string>([['/folder/bar.d.ts', 'replacement/bar.d.ts']]);

    const result = replaceImportPaths(project, '/folder/foo.d.ts', 'import "./bar.js"', replacements);

    t.is(result, 'import "replacement/bar.js";');
});

test('keeps shebang line in the transformed output', (t) => {
    const project = createProject({
        withFiles: [
            { filePath: '/folder/foo.ts', content: '#!/usr/bin/env node\nconst foo = "bar"; import "./bar";' },
            { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
        ]
    });
    const replacements = new Map<string, string>([['/folder/bar.ts', 'replacement']]);

    const result = replaceImportPaths(
        project,
        '/folder/foo.ts',
        '#!/usr/bin/env node\nconst foo = "bar"; import "./bar";',
        replacements
    );

    t.is(result, '#!/usr/bin/env node\nconst foo = "bar"; import "replacement";');
});
