import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';

function createBundle(name: string, sourceFilePath: string): LinkedBundle {
    return {
        name,
        contents: [
            {
                fileDescription: {
                    sourceFilePath,
                    targetFilePath: sourceFilePath,
                    content: '',
                    isExecutable: false
                },
                directDependencies: new Set<string>(),
                isSubstituted: false,
                isExplicitlyIncluded: false
            }
        ],
        entryPoints: [
            {
                js: {
                    sourceFilePath,
                    targetFilePath: sourceFilePath,
                    content: '',
                    isExecutable: false
                }
            }
        ] as const,
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map()
    };
}

test('run() returns all duplicate-file issues when no allow list is configured', () => {
    const result = noDuplicatedFilesRule.run(
        { bundles: [createBundle('b', 'shared.ts'), createBundle('a', 'shared.ts')] },
        { noDuplicatedFiles: { enabled: true } }
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('isEnabled() returns false when the rule config is missing', () => {
    const result = noDuplicatedFilesRule.isEnabled(undefined);

    assert.strictEqual(result, false);
});

test('run() still reports duplicates when the allow list is empty because the rule is disabled', () => {
    const result = noDuplicatedFilesRule.run(
        { bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts')] },
        { noDuplicatedFiles: { enabled: false } }
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});
