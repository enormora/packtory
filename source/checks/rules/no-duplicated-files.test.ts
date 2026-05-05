import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import { isNoDuplicatedFilesRuleEnabled, runNoDuplicatedFilesRule } from './no-duplicated-files.ts';

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

test('exports the enabled-check and runner functions', () => {
    assert.strictEqual(typeof isNoDuplicatedFilesRuleEnabled, 'function');
    assert.strictEqual(typeof runNoDuplicatedFilesRule, 'function');
});

test('run() returns all duplicate-file issues when no allow list is configured', () => {
    const result = runNoDuplicatedFilesRule(
        { bundles: [createBundle('b', 'shared.ts'), createBundle('a', 'shared.ts')] },
        { noDuplicatedFiles: { enabled: true } }
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('isEnabled() returns false when the rule config is missing', () => {
    const result = isNoDuplicatedFilesRuleEnabled(undefined);

    assert.strictEqual(result, false);
});

test('isEnabled() returns true when the rule is explicitly enabled', () => {
    const result = isNoDuplicatedFilesRuleEnabled({ noDuplicatedFiles: { enabled: true } });

    assert.strictEqual(result, true);
});

test('isEnabled() returns false when the rule is explicitly disabled', () => {
    const result = isNoDuplicatedFilesRuleEnabled({ noDuplicatedFiles: { enabled: false } });

    assert.strictEqual(result, false);
});

test('run() still reports duplicates when the allow list is empty because the rule is disabled', () => {
    const result = runNoDuplicatedFilesRule(
        { bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts')] },
        { noDuplicatedFiles: { enabled: false } }
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('run() ignores duplicate-file issues that are allow-listed only when the rule is enabled', () => {
    const result = runNoDuplicatedFilesRule(
        { bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts')] },
        { noDuplicatedFiles: { enabled: true, allowList: ['shared.ts'] } }
    );

    assert.deepStrictEqual(result, []);
});

test('run() still reports duplicates when settings are missing entirely', () => {
    const result = runNoDuplicatedFilesRule(
        { bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts')] },
        undefined
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('run() ignores the allow list when the rule is disabled', () => {
    const result = runNoDuplicatedFilesRule(
        { bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts')] },
        { noDuplicatedFiles: { enabled: false, allowList: ['shared.ts'] } }
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('run() suppresses a duplicate when a scoped allow-list entry covers all owners', () => {
    const result = runNoDuplicatedFilesRule(
        { bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts')] },
        {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'shared.ts', packages: ['a', 'b'] }]
            }
        }
    );

    assert.deepStrictEqual(result, []);
});

test('run() reports a duplicate when a scoped allow-list entry omits one of the actual owners', () => {
    const result = runNoDuplicatedFilesRule(
        {
            bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts'), createBundle('c', 'shared.ts')]
        },
        {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'shared.ts', packages: ['a', 'b'] }]
            }
        }
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b, c']);
});

test('run() does not match a scoped entry when the file path differs', () => {
    const result = runNoDuplicatedFilesRule(
        { bundles: [createBundle('a', 'shared.ts'), createBundle('b', 'shared.ts')] },
        {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'other.ts', packages: ['a', 'b'] }]
            }
        }
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('run() supports a mix of plain string and scoped allow-list entries', () => {
    const result = runNoDuplicatedFilesRule(
        {
            bundles: [
                createBundle('a', 'shared.ts'),
                createBundle('b', 'shared.ts'),
                createBundle('c', 'license'),
                createBundle('d', 'license')
            ]
        },
        {
            noDuplicatedFiles: {
                enabled: true,
                allowList: ['license', { filePath: 'shared.ts', packages: ['a', 'b'] }]
            }
        }
    );

    assert.deepStrictEqual(result, []);
});
