import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Project } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import type { ImportPathReplacement } from '../replacement-lookup.ts';
import { replaceImportPathsWithTransform } from './import-paths.ts';

type Replacements = ReadonlyMap<string, ImportPathReplacement>;

function replacement(emittedSpecifier: string, packageName = emittedSpecifier): ImportPathReplacement {
    return { emittedSpecifier, packageName };
}

function replaceImportPaths(
    project: Project | undefined,
    sourceFilePath: string,
    sourceContent: string,
    replacements: Replacements
): string {
    return replaceImportPathsWithTransform(project, sourceFilePath, sourceContent, replacements).content;
}

suite('import-paths', function () {
    test('returns source code unmodified when project is undefined', function () {
        const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

        const result = replaceImportPathsWithTransform(
            undefined,
            '/folder/foo.ts',
            'const foo = "bar"; import "./bar";',
            replacements
        );

        assert.deepStrictEqual(result, {
            content: 'const foo = "bar"; import "./bar";',
            dependencyReferences: [],
            sourceMapTransform: undefined
        });
    });

    test('returns source code unmodified when there is no matching file in the given project', function () {
        const project = createProject({
            withFiles: [ { filePath: '/folder/bar.ts', content: 'const bar = "baz";' } ]
        });
        const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

        const result = replaceImportPathsWithTransform(
            project,
            '/folder/foo.ts',
            'const foo = "bar"; import "./bar";',
            replacements
        );

        assert.deepStrictEqual(result, {
            content: 'const foo = "bar"; import "./bar";',
            dependencyReferences: [],
            sourceMapTransform: undefined
        });
    });

    test('returns source code unmodified when it doesn’t contain any import statement that needs to be replaced', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/folder/foo.ts', content: 'const foo = "bar";' },
                { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
            ]
        });
        const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

        const result = replaceImportPaths(project, '/folder/foo.ts', 'const foo = "bar";', replacements);

        assert.strictEqual(result, 'const foo = "bar";');
    });

    test('returns the source code unmodified when there are no replacements', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";' },
                { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
            ]
        });
        const replacements = new Map<string, ImportPathReplacement>();

        const result = replaceImportPathsWithTransform(
            project,
            '/folder/foo.ts',
            'const foo = "bar"; import "./bar";',
            replacements
        );

        assert.deepStrictEqual(result, {
            content: 'const foo = "bar"; import "./bar";',
            dependencyReferences: [],
            sourceMapTransform: undefined
        });
    });

    test('returns the source code with the modified import statement', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/folder/foo.ts', content: 'const foo = "bar"; import "./bar";' },
                { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
            ]
        });
        const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

        const result = replaceImportPaths(
            project,
            '/folder/foo.ts',
            'const foo = "bar"; import "./bar";',
            replacements
        );

        assert.strictEqual(result, 'const foo = "bar"; import "replacement";');
    });

    test('modifies only matching import statements and keeps non-matching statements unchanged', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/folder/foo.ts', content: 'import "./baz"; import "./bar";' },
                { filePath: '/folder/bar.ts', content: 'const bar = "baz";' },
                { filePath: '/folder/baz.ts', content: 'const baz = "qux";' }
            ]
        });
        const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

        const result = replaceImportPaths(project, '/folder/foo.ts', 'import "./baz"; import "./bar";', replacements);

        assert.strictEqual(result, 'import "./baz"; import "replacement";');
    });

    test('modifies import statements correctly in d.ts files', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/folder/foo.d.ts', content: 'import "./bar.js";' },
                { filePath: '/folder/bar.d.ts', content: 'const bar = "baz";' }
            ]
        });
        const replacements = new Map([ [ '/folder/bar.d.ts', replacement('replacement/bar.d.ts') ] ]);

        const result = replaceImportPaths(project, '/folder/foo.d.ts', 'import "./bar.js"', replacements);

        assert.strictEqual(result, 'import "replacement/bar.d.ts"');
    });

    test('keeps shebang line in the transformed output', function () {
        const project = createProject({
            withFiles: [
                { filePath: '/folder/foo.ts', content: '#!/usr/bin/env node\nconst foo = "bar"; import "./bar";' },
                { filePath: '/folder/bar.ts', content: 'const bar = "baz";' }
            ]
        });
        const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

        const result = replaceImportPaths(
            project,
            '/folder/foo.ts',
            '#!/usr/bin/env node\nconst foo = "bar"; import "./bar";',
            replacements
        );

        assert.strictEqual(result, '#!/usr/bin/env node\nconst foo = "bar"; import "replacement";');
    });

    suite('call expression literals', function () {
        test('modifies import.meta.resolve() literals', function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/folder/foo.ts', content: 'const url = import.meta.resolve("./bar.js");' },
                    { filePath: '/folder/bar.ts', content: 'export {};' }
                ]
            });
            const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

            const result = replaceImportPaths(
                project,
                '/folder/foo.ts',
                'const url = import.meta.resolve("./bar.js");',
                replacements
            );

            assert.strictEqual(result, 'const url = import.meta.resolve("replacement");');
        });

        test('modifies dynamic import literals', function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/folder/foo.ts', content: 'export const loaded = import("./bar.js");' },
                    { filePath: '/folder/bar.ts', content: 'export {};' }
                ]
            });
            const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

            const result = replaceImportPaths(
                project,
                '/folder/foo.ts',
                'export const loaded = import("./bar.js");',
                replacements
            );

            assert.strictEqual(result, 'export const loaded = import("replacement");');
        });
    });

    suite('source map transform data', function () {
        test('returns compact source map transform data only when literals are rewritten', function () {
            const content = 'import "./bar";\nexport const value = 1;';
            const project = createProject({
                withFiles: [
                    { filePath: '/folder/foo.ts', content },
                    { filePath: '/folder/bar.ts', content: 'export {};' }
                ]
            });
            const replacements = new Map([ [ '/folder/bar.ts', replacement('replacement') ] ]);

            const result = replaceImportPathsWithTransform(project, '/folder/foo.ts', content, replacements);
            const passThrough = replaceImportPathsWithTransform(project, '/folder/foo.ts', content, new Map());
            const transform = result.sourceMapTransform as Record<string, unknown>;

            assert.deepStrictEqual(result.sourceMapTransform?.atoms, [
                { originalStart: 0, originalEnd: 8, newStart: 0 },
                { originalStart: 13, originalEnd: content.length, newStart: 19 }
            ]);
            assert.partialDeepStrictEqual({
                hasOriginalCode: Object.hasOwn(transform, 'originalCode'),
                hasTransformedCode: Object.hasOwn(transform, 'transformedCode'),
                passThroughSourceMapTransform: passThrough.sourceMapTransform
            }, {
                hasOriginalCode: false,
                hasTransformedCode: false,
                passThroughSourceMapTransform: undefined
            });
        });

        test('applies edits in source order when import.meta.resolve() appears before an import', function () {
            const content = 'const url = import.meta.resolve("./bar.js"); import "./baz.js";';
            const project = createProject({
                withFiles: [
                    { filePath: '/folder/foo.ts', content },
                    { filePath: '/folder/bar.ts', content: 'export {};' },
                    { filePath: '/folder/baz.ts', content: 'export {};' }
                ]
            });
            const replacements = new Map([
                [ '/folder/bar.ts', replacement('bar-package') ],
                [ '/folder/baz.ts', replacement('baz-package') ]
            ]);

            const result = replaceImportPathsWithTransform(project, '/folder/foo.ts', content, replacements);

            assert.partialDeepStrictEqual(result, {
                content: 'const url = import.meta.resolve("bar-package"); import "baz-package";',
                dependencyReferences: [
                    { name: 'bar-package', sourceSpecifier: './bar.js', emittedSpecifier: 'bar-package' },
                    { name: 'baz-package', sourceSpecifier: './baz.js', emittedSpecifier: 'baz-package' }
                ]
            });
        });
    });
});
