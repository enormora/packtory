import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { FileDescription } from '../../file-manager/file-description.ts';
import { inspectArtifactSizes } from './inspect-artifact-sizes.ts';

function description(filePath: string, content = ''): FileDescription {
    return { filePath, content, isExecutable: false };
}

function registerArtifactKindTests(): void {
    test('inspectArtifactSizes maps file paths and content lengths', function () {
        const entries = inspectArtifactSizes([
            { filePath: 'package.json', content: '{"name":"a"}', isExecutable: false },
            {
                filePath: 'src/index.js',
                content: 'export const a = 1;',
                isExecutable: false,
                sourceFilePath: '/workspace/src/index.js'
            }
        ]);

        assert.deepStrictEqual(entries, [
            { path: 'package.json', sizeBytes: 12, kind: 'manifest', status: 'generated', badges: [] },
            {
                path: 'src/index.js',
                sizeBytes: 19,
                kind: 'source',
                sourcePath: '/workspace/src/index.js',
                status: 'unchanged',
                badges: []
            }
        ]);
    });

    test('inspectArtifactSizes classifies a nested package.json as manifest', function () {
        const [ entry ] = inspectArtifactSizes([ description('nested/dir/package.json') ]);
        assert.strictEqual(entry?.kind, 'manifest');
    });

    test('inspectArtifactSizes does NOT classify a sibling-suffixed package.json as manifest', function () {
        const [ entry ] = inspectArtifactSizes([ description('inner-package.json') ]);
        assert.notStrictEqual(entry?.kind, 'manifest');
    });

    test('inspectArtifactSizes recognizes sbom files', function () {
        const entries = inspectArtifactSizes([
            { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false },
            { filePath: 'project.sbom.json', content: '{}', isExecutable: false }
        ]);

        assert.deepStrictEqual(
            entries.map(function (entry) {
                return entry.kind;
            }),
            [ 'sbom', 'sbom' ]
        );
    });

    test('inspectArtifactSizes treats unknown files as additional', function () {
        const entries = inspectArtifactSizes([ { filePath: 'README.md', content: '# hi', isExecutable: false } ]);

        assert.strictEqual(entries[0]?.kind, 'additional');
    });

    test('inspectArtifactSizes does not classify a generic .json as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('data.json') ]);
        assert.strictEqual(entry?.kind, 'additional');
    });
}

function registerSourceExtensionTests(): void {
    test('inspectArtifactSizes classifies .js as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.js') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .cjs as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.cjs') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .mjs as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.mjs') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .ts as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.ts') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .tsx as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.tsx') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .jsx as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.jsx') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .d.ts as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.d.ts') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .d.cts as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.d.cts') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .d.mts as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.d.mts') ]);
        assert.strictEqual(entry?.kind, 'source');
    });

    test('inspectArtifactSizes classifies .map as source', function () {
        const [ entry ] = inspectArtifactSizes([ description('a.js.map') ]);
        assert.strictEqual(entry?.kind, 'source');
    });
}

function registerArtifactMetadataTests(): void {
    test('inspectArtifactSizes returns utf-8 byte length for multi-byte content', function () {
        const entries = inspectArtifactSizes([ { filePath: 'note.txt', content: '✓', isExecutable: false } ]);

        assert.strictEqual(entries[0]?.sizeBytes, 3);
    });

    test('inspectArtifactSizes reports zero bytes for empty content', function () {
        const [ entry ] = inspectArtifactSizes([ description('file.txt', '') ]);
        assert.strictEqual(entry?.sizeBytes, 0);
    });

    test('inspectArtifactSizes preserves the original file path on each entry', function () {
        const [ entry ] = inspectArtifactSizes([ description('deep/nested/file.js') ]);
        assert.strictEqual(entry?.path, 'deep/nested/file.js');
    });

    test('inspectArtifactSizes marks a substituted source file as changed with an import rewrite badge', function () {
        const [ entry ] = inspectArtifactSizes([
            {
                filePath: 'deep/nested/file.js',
                content: 'export {};',
                isExecutable: false,
                sourceFilePath: '/workspace/src/file.js',
                isSubstituted: true
            }
        ]);

        assert.deepStrictEqual(entry, {
            path: 'deep/nested/file.js',
            sizeBytes: 10,
            kind: 'source',
            sourcePath: '/workspace/src/file.js',
            status: 'changed',
            badges: [ 'import-path-rewrite' ]
        });
    });

    test('inspectArtifactSizes returns one entry per input descriptor', function () {
        const entries = inspectArtifactSizes([
            description('a.js', 'a'),
            description('b.ts', 'bb'),
            description('c.txt', 'ccc')
        ]);
        assert.strictEqual(entries.length, 3);
    });
}

suite('inspect-artifact-sizes', function () {
    registerArtifactKindTests();
    registerSourceExtensionTests();
    registerArtifactMetadataTests();
});
