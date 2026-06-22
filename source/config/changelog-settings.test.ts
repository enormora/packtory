import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { suite, test } from 'mocha';
import { changelogSettingsSchema, validateChangelogSettings } from './changelog-settings.ts';
import type { PacktoryConfigWithoutRegistry } from './config.ts';

function configWith(changelog: PacktoryConfigWithoutRegistry['changelog']): PacktoryConfigWithoutRegistry {
    return {
        changelog,
        packages: [
            {
                sourcesFolder: 'src/pkg-a',
                mainPackageJson: { type: 'module' },
                name: 'pkg-a',
                roots: { main: { js: 'index.js' } },
                publishSettings: { access: 'public' }
            },
            {
                sourcesFolder: 'src/pkg-b',
                mainPackageJson: { type: 'module' },
                name: 'pkg-b',
                roots: { main: { js: 'index.js' } },
                publishSettings: { access: 'public' }
            }
        ]
    };
}

function packageWithoutSources(name: string, jsFile: string) {
    return {
        name,
        mainPackageJson: { type: 'module' },
        roots: { main: { js: jsFile } }
    } as const;
}

function packagesWithoutSources() {
    return [packageWithoutSources('pkg-a', 'a.js'), packageWithoutSources('pkg-b', 'b.js')] as const;
}

suite('changelog-settings', function () {
    test('schema accepts all output kinds', function () {
        const result = safeParse(changelogSettingsSchema, {
            outputs: [
                { kind: 'repository-file', path: 'CHANGELOG.md' },
                { kind: 'package-file', path: 'docs/CHANGELOG.md' },
                {
                    kind: 'package-file',
                    paths: {
                        'pkg-a': 'packages/pkg-a/CHANGELOG.md',
                        'pkg-b': 'packages/pkg-b/CHANGELOG.md'
                    }
                },
                { kind: 'github-release' }
            ]
        });

        assert.strictEqual(result.success, true);
    });

    test('schema accepts label and base-ref settings without outputs', function () {
        const result = safeParse(changelogSettingsSchema, {
            labels: { bug: 'Fixes', operations: 'Operations' },
            targetScopedLabelPattern: 'scope:{targetName}:{label}',
            packageTagFormat: 'pkg/{packageName}/v{version}',
            explicitBaseRef: 'main'
        });

        assert.strictEqual(result.success, true);
    });

    test('schema rejects empty outputs', function () {
        assert.strictEqual(safeParse(changelogSettingsSchema, { outputs: [] }).success, false);
    });

    test('schema rejects empty label, pattern and base-ref settings', function () {
        assert.strictEqual(safeParse(changelogSettingsSchema, { labels: { bug: '' } }).success, false);
        assert.strictEqual(safeParse(changelogSettingsSchema, { labels: { '': 'Fixes' } }).success, false);
        assert.strictEqual(safeParse(changelogSettingsSchema, { targetScopedLabelPattern: '' }).success, false);
        assert.strictEqual(safeParse(changelogSettingsSchema, { packageTagFormat: '' }).success, false);
        assert.strictEqual(safeParse(changelogSettingsSchema, { explicitBaseRef: '' }).success, false);
    });

    test('schema rejects unsafe output paths', function () {
        assert.strictEqual(
            safeParse(changelogSettingsSchema, {
                outputs: [{ kind: 'repository-file', path: '../CHANGELOG.md' }]
            }).success,
            false
        );
        assert.strictEqual(
            safeParse(changelogSettingsSchema, {
                outputs: [{ kind: 'package-file', path: '/CHANGELOG.md' }]
            }).success,
            false
        );
        assert.strictEqual(
            safeParse(changelogSettingsSchema, {
                outputs: [{ kind: 'package-file', paths: { 'pkg-a': '../CHANGELOG.md' } }]
            }).success,
            false
        );
    });

    test('schema rejects empty explicit package-file paths', function () {
        assert.strictEqual(
            safeParse(changelogSettingsSchema, {
                outputs: [{ kind: 'package-file', paths: {} }]
            }).success,
            false
        );
    });

    test('schema rejects extra output object properties', function () {
        assert.strictEqual(
            safeParse(changelogSettingsSchema, {
                outputs: [{ kind: 'github-release', path: 'CHANGELOG.md' }]
            }).success,
            false
        );
        assert.strictEqual(
            safeParse(changelogSettingsSchema, {
                outputs: [{ kind: 'package-file', path: 'CHANGELOG.md', paths: { 'pkg-a': 'CHANGELOG.md' } }]
            }).success,
            false
        );
    });

    test('validation rejects duplicate github-release outputs', function () {
        const result = validateChangelogSettings(
            configWith({ outputs: [{ kind: 'github-release' }, { kind: 'github-release' }] })
        );

        assert.deepStrictEqual(result, ['changelog.outputs must not contain duplicate github-release outputs']);
    });

    test('validation accepts a single github-release output', function () {
        const result = validateChangelogSettings(configWith({ outputs: [{ kind: 'github-release' }] }));

        assert.deepStrictEqual(result, []);
    });

    test('validation accepts target-scoped label patterns with both placeholders', function () {
        const result = validateChangelogSettings(
            configWith({ targetScopedLabelPattern: 'scope:{targetName}:{label}' })
        );

        assert.deepStrictEqual(result, []);
    });

    test('validation rejects target-scoped label patterns without the target placeholder', function () {
        assert.deepStrictEqual(validateChangelogSettings(configWith({ targetScopedLabelPattern: 'scope:{label}' })), [
            'changelog.targetScopedLabelPattern must contain {targetName} and {label}'
        ]);
    });

    test('validation rejects target-scoped label patterns without the label placeholder', function () {
        assert.deepStrictEqual(
            validateChangelogSettings(configWith({ targetScopedLabelPattern: 'scope:{targetName}' })),
            ['changelog.targetScopedLabelPattern must contain {targetName} and {label}']
        );
    });

    test('validation rejects duplicate repository-file paths', function () {
        const result = validateChangelogSettings(
            configWith({
                outputs: [
                    { kind: 'repository-file', path: 'docs/CHANGELOG.md' },
                    { kind: 'repository-file', path: 'docs\\CHANGELOG.md' }
                ]
            })
        );

        assert.deepStrictEqual(result, [
            'changelog.outputs must not contain duplicate repository-file path "docs/CHANGELOG.md"'
        ]);
    });

    test('validation rejects package-file destinations that resolve to the same file', function () {
        const result = validateChangelogSettings({
            changelog: { outputs: [{ kind: 'package-file', path: 'CHANGELOG.md' }] },
            commonPackageSettings: { sourcesFolder: 'src', publishSettings: { access: 'public' } },
            packages: packagesWithoutSources()
        });

        assert.deepStrictEqual(result, [
            'changelog.outputs package-file destinations must resolve to unique files; "src/CHANGELOG.md" is duplicated'
        ]);
    });

    test('validation rejects duplicate explicit package-file destinations', function () {
        const result = validateChangelogSettings(
            configWith({
                outputs: [
                    {
                        kind: 'package-file',
                        paths: {
                            'pkg-a': 'packages/pkg-a/CHANGELOG.md',
                            'pkg-b': 'packages\\pkg-a\\CHANGELOG.md'
                        }
                    }
                ]
            })
        );

        assert.deepStrictEqual(result, [
            [
                'changelog.outputs package-file destinations must resolve to unique files;',
                '"packages/pkg-a/CHANGELOG.md" is duplicated'
            ].join(' ')
        ]);
    });

    test('validation skips package-file destination checks when sourcesFolder is unavailable', function () {
        const result = validateChangelogSettings({
            changelog: { outputs: [{ kind: 'package-file', path: 'CHANGELOG.md' }] },
            packages: packagesWithoutSources()
        });

        assert.deepStrictEqual(result, []);
    });
});
