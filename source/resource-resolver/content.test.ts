import assert from 'node:assert';
import { test } from 'mocha';
import { combineAllBundleFiles } from './content.ts';

test('combines all bundle files correctly', () => {
    const result = combineAllBundleFiles('/foo', [], []);
    assert.deepStrictEqual(result, []);
});

test('keeps absolute local dependency paths and derives relative target paths from sourcesFolder', () => {
    const result = combineAllBundleFiles(
        '/src',
        [
            {
                filePath: '/src/nested/index.js',
                directDependencies: new Set(['/src/nested/internal.js']),
                project: 'project' as never
            }
        ],
        []
    );

    assert.deepStrictEqual(result, [
        {
            sourceFilePath: '/src/nested/index.js',
            targetFilePath: 'nested/index.js',
            directDependencies: new Set(['/src/nested/internal.js']),
            project: 'project',
            isExplicitlyIncluded: false
        }
    ]);
});

test('normalizes object-form additional files and marks them as explicitly included', () => {
    const result = combineAllBundleFiles(
        '/src',
        [],
        [
            { sourceFilePath: 'assets/readme.md', targetFilePath: 'readme.md' },
            { sourceFilePath: '/absolute/license.txt', targetFilePath: 'license.txt' }
        ]
    );

    assert.deepStrictEqual(result, [
        {
            sourceFilePath: '/src/assets/readme.md',
            targetFilePath: 'readme.md',
            directDependencies: new Set(),
            isExplicitlyIncluded: true
        },
        {
            sourceFilePath: '/absolute/license.txt',
            targetFilePath: 'license.txt',
            directDependencies: new Set(),
            isExplicitlyIncluded: true
        }
    ]);
});

test('marks string-form additional files as explicitly included', () => {
    const result = combineAllBundleFiles('/src', [], ['readme.md']);

    assert.deepStrictEqual(result, [
        {
            sourceFilePath: '/src/readme.md',
            targetFilePath: 'readme.md',
            directDependencies: new Set(),
            isExplicitlyIncluded: true
        }
    ]);
});

test('throws when an object-form additional file uses an absolute target path', () => {
    try {
        combineAllBundleFiles('/src', [], [{ sourceFilePath: 'file.txt', targetFilePath: '/absolute/file.txt' }]);
        assert.fail('Expected combineAllBundleFiles() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'The targetFilePath must be relative');
    }
});

const additionalCodeFileErrorMessage = [
    'additionalFiles must not include code files; received "lib/template.ts".',
    'Code that should ship in the bundle must be reachable from an entry point so',
    'dependency, side-effect and dead-code analyses can run on it.',
    'If you intend to ship code as a static asset (e.g. a template),',
    'use a non-code extension like .txt.'
].join(' ');

test('throws when a string-form additional file points at a code file', () => {
    try {
        combineAllBundleFiles('/src', [], ['lib/template.ts']);
        assert.fail('Expected combineAllBundleFiles() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, additionalCodeFileErrorMessage);
    }
});

test('throws when an object-form additional file targets a code file', () => {
    try {
        combineAllBundleFiles(
            '/src',
            [],
            [{ sourceFilePath: 'assets/template.txt', targetFilePath: 'lib/template.ts' }]
        );
        assert.fail('Expected combineAllBundleFiles() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, additionalCodeFileErrorMessage);
    }
});

test('accepts an additional file whose target path retains a code-shaped source via a non-code extension', () => {
    const result = combineAllBundleFiles(
        '/src',
        [],
        [{ sourceFilePath: 'fixtures/template.ts', targetFilePath: 'fixtures/template.ts.txt' }]
    );
    assert.deepStrictEqual(result, [
        {
            sourceFilePath: '/src/fixtures/template.ts',
            targetFilePath: 'fixtures/template.ts.txt',
            directDependencies: new Set(),
            isExplicitlyIncluded: true
        }
    ]);
});
