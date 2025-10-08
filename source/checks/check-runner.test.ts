import test from 'ava';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { runChecks } from './check-runner.ts';

function createBundle(name: string, filePaths: readonly string[]): LinkedBundle {
    return {
        name,
        contents: filePaths.map((filePath) => {
            return {
                fileDescription: {
                    sourceFilePath: filePath,
                    targetFilePath: filePath,
                    content: '',
                    isExecutable: false
                },
                directDependencies: new Set<string>(),
                isSubstituted: false,
                isExplicitlyIncluded: false
            };
        }),
        entryPoints: [
            {
                js: {
                    sourceFilePath: `${name}/index.js`,
                    targetFilePath: 'index.js',
                    content: '',
                    isExecutable: false
                }
            }
        ],
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map()
    };
}

test('does not report issues when checks are disabled', (t) => {
    const issues = runChecks({
        settings: {},
        bundles: [createBundle('a', ['file-a.ts']), createBundle('b', ['file-b.ts'])]
    });

    t.deepEqual(issues, []);
});

test('reports duplicate files when the rule is enabled', (t) => {
    const issues = runChecks({
        settings: { noDuplicatedFiles: { enabled: true } },
        bundles: [createBundle('a', ['shared.ts']), createBundle('b', ['shared.ts'])]
    });

    t.deepEqual(issues, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('ignores duplicate files when the rule is disabled', (t) => {
    const issues = runChecks({
        settings: {},
        bundles: [createBundle('a', ['shared.ts']), createBundle('b', ['shared.ts'])]
    });

    t.deepEqual(issues, []);
});

test('ignores duplicate files that are present in the allow list', (t) => {
    const issues = runChecks({
        settings: { noDuplicatedFiles: { enabled: true, allowList: ['shared.ts'] } },
        bundles: [createBundle('a', ['shared.ts']), createBundle('b', ['shared.ts']), createBundle('c', ['other.ts'])]
    });

    t.deepEqual(issues, []);
});

test('reports duplicate files that are not present in the allow list', (t) => {
    const issues = runChecks({
        settings: { noDuplicatedFiles: { enabled: true, allowList: ['shared.ts'] } },
        bundles: [
            createBundle('a', ['shared.ts', 'not-allowed.ts']),
            createBundle('b', ['shared.ts', 'not-allowed.ts'])
        ]
    });

    t.deepEqual(issues, ['File "not-allowed.ts" is included in multiple packages: a, b']);
});
