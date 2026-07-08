import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../../source/config/config.ts';

async function createBaseConfig(fixturePath: string): Promise<PacktoryConfigWithoutRegistry> {
    return {
        commonPackageSettings: {
            sourcesFolder: path.join(fixturePath, 'src'),
            mainPackageJson: await loadPackageJson(fixturePath),
            publishSettings: { access: 'public' }
        },
        packages: [
            {
                name: 'pkg-a',
                roots: {
                    main: {
                        js: path.join(fixturePath, 'src/pkg-a/index.js')
                    }
                }
            },
            {
                name: 'pkg-b',
                roots: {
                    main: {
                        js: path.join(fixturePath, 'src/pkg-b/index.js')
                    }
                }
            }
        ]
    };
}

function packageConfigAt(config: PacktoryConfigWithoutRegistry, index: number): PackageConfig {
    const packageConfig = config.packages[index];
    assert.notStrictEqual(packageConfig, undefined);
    return packageConfig;
}

function firstIssue(issues: readonly string[]): string {
    const [ issue ] = issues;
    assert.notStrictEqual(issue, undefined);
    return issue;
}

async function maxBundleOverrideConfig(fixturePath: string): Promise<PacktoryConfigWithoutRegistry> {
    const baseConfig = await createBaseConfig(fixturePath);
    return {
        ...baseConfig,
        checks: { maxBundleSize: { enabled: true, bytes: 10_000 } },
        packages: [
            {
                ...packageConfigAt(baseConfig, 0),
                checks: { maxBundleSize: { bytes: 1 } }
            },
            packageConfigAt(baseConfig, 1)
        ]
    };
}

async function duplicateConsentConfig(fixturePath: string): Promise<PacktoryConfigWithoutRegistry> {
    const baseConfig = await createBaseConfig(fixturePath);
    const sharedFile = `${fixturePath}/src/shared/util.js`;
    return {
        ...baseConfig,
        checks: { noDuplicatedFiles: { enabled: true } },
        packages: [
            {
                ...packageConfigAt(baseConfig, 0),
                checks: { noDuplicatedFiles: { allowList: [ sharedFile ] } }
            },
            packageConfigAt(baseConfig, 1)
        ]
    };
}

async function duplicatedFilesCheckConfig(fixturePath: string): Promise<PacktoryConfigWithoutRegistry> {
    const baseConfig = await createBaseConfig(fixturePath);
    return {
        ...baseConfig,
        checks: { noDuplicatedFiles: { enabled: true } }
    };
}

suite('checks', function () {
    test('resolveAndLinkAll() reports duplicated files when the rule is enabled', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const config = await duplicatedFilesCheckConfig(fixturePath);

        const { result } = await resolveAndLinkAll(config);

        if (!result.isErr) {
            assert.fail('Expected resolveAndLinkAll to fail because of duplicated files');
            return;
        }

        if (result.error.type === 'checks') {
            assert.deepStrictEqual(result.error.issues, [
                [
                    `File "${fixturePath}/src/shared/util.js" has shared declarations across multiple packages:`,
                    '  - "sharedValue" → pkg-a, pkg-b'
                ]
                    .join('\n')
            ]);
        } else {
            assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
        }
    });

    test('resolveAndLinkAll succeeds when checks are disabled', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const config = await createBaseConfig(fixturePath);

        const { result } = await resolveAndLinkAll(config);

        if (!result.isOk) {
            assert.fail('Duplicated file rule should not run when disabled');
        }

        assert.strictEqual(result.value.length, 2);
    });

    test('resolveAndLinkAll succeeds when the global allowList covers the duplicated file', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const baseConfig = await createBaseConfig(fixturePath);
        const sharedFile = `${fixturePath}/src/shared/util.js`;
        const config = {
            ...baseConfig,
            checks: { noDuplicatedFiles: { enabled: true, allowList: [ sharedFile ] } }
        };

        const { result } = await resolveAndLinkAll(config);

        if (!result.isOk) {
            assert.fail('Globally allow-listed shared file should not fail checks');
        }

        assert.strictEqual(result.value.length, 2);
    });

    test('resolveAndLinkAll succeeds when every owner consents to the duplicated file', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const baseConfig = await createBaseConfig(fixturePath);
        const sharedFile = `${fixturePath}/src/shared/util.js`;
        const config = {
            ...baseConfig,
            checks: { noDuplicatedFiles: { enabled: true } },
            packages: baseConfig.packages.map(function (packageConfig) {
                return {
                    ...packageConfig,
                    checks: { noDuplicatedFiles: { allowList: [ sharedFile ] } }
                };
            })
        };

        const { result } = await resolveAndLinkAll(config);

        if (!result.isOk) {
            assert.fail('Owners that all consent to the shared file should not fail checks');
        }

        assert.strictEqual(result.value.length, 2);
    });

    test('resolveAndLinkAll reports an external dependency that is only declared in devDependencies', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/with-peer-dependencies');
        const config: PacktoryConfigWithoutRegistry = {
            commonPackageSettings: {
                sourcesFolder: path.join(fixturePath, 'src'),
                mainPackageJson: {
                    type: 'module',
                    devDependencies: { 'example-module': '1.2.3' }
                },
                publishSettings: { access: 'public' }
            },
            checks: { noDevDependencyImports: { enabled: true } },
            packages: [
                {
                    name: 'leaky',
                    roots: { main: { js: path.join(fixturePath, 'src/entry.js') } }
                }
            ]
        };

        const { result } = await resolveAndLinkAll(config);

        if (!result.isErr) {
            assert.fail('Expected resolveAndLinkAll to fail because example-module is dev-only');
            return;
        }

        if (result.error.type === 'checks') {
            assert.deepStrictEqual(result.error.issues, [
                'Package "leaky" imports "example-module" which is only declared in devDependencies of the main package.json'
            ]);
        } else {
            assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
        }
    });

    test('resolveAndLinkAll reports a declared bundleDependency that is never imported', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/independent-packages');
        const baseConfig = await createBaseConfig(fixturePath);
        const config = {
            ...baseConfig,
            checks: { noUnusedBundleDependencies: { enabled: true } },
            packages: [
                packageConfigAt(baseConfig, 1),
                { ...packageConfigAt(baseConfig, 0), bundleDependencies: [ 'pkg-b' ] }
            ]
        };

        const { result } = await resolveAndLinkAll(config);

        if (!result.isErr) {
            assert.fail('Expected resolveAndLinkAll to fail because pkg-a does not import from pkg-b');
            return;
        }

        if (result.error.type === 'checks') {
            assert.deepStrictEqual(result.error.issues, [
                'Unused bundle dependency "pkg-b" declared by package "pkg-a"'
            ]);
        } else {
            assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
        }
    });

    test('resolveAndLinkAll reports a per-package bundle size override that is exceeded', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const config = await maxBundleOverrideConfig(fixturePath);

        const { result } = await resolveAndLinkAll(config);

        if (!result.isErr) {
            assert.fail('Expected resolveAndLinkAll to fail because pkg-a exceeds its size override');
            return;
        }

        if (result.error.type === 'checks') {
            assert.strictEqual(result.error.issues.length, 1);
            assert.match(
                firstIssue(result.error.issues),
                /^Package "pkg-a" exceeds the maximum bundle size: \d+ bytes \(limit: 1 bytes\)$/u
            );
        } else {
            assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
        }
    });

    test('resolveAndLinkAll reports a missing required file for every bundle that lacks it', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const baseConfig = await createBaseConfig(fixturePath);
        const config = {
            ...baseConfig,
            checks: { requiredFiles: { enabled: true, files: [ 'LICENSE' ] } }
        };

        const { result } = await resolveAndLinkAll(config);

        if (!result.isErr) {
            assert.fail('Expected resolveAndLinkAll to fail because of missing required files');
            return;
        }

        if (result.error.type === 'checks') {
            assert.deepStrictEqual(result.error.issues, [
                'Package "pkg-a" is missing required file "LICENSE"',
                'Package "pkg-b" is missing required file "LICENSE"'
            ]);
        } else {
            assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
        }
    });

    test('resolveAndLinkAll reports the duplicate when one owner does not consent', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
        const config = await duplicateConsentConfig(fixturePath);

        const { result } = await resolveAndLinkAll(config);

        if (!result.isErr) {
            assert.fail('Expected resolveAndLinkAll to fail because pkg-b did not consent');
            return;
        }

        if (result.error.type === 'checks') {
            assert.deepStrictEqual(result.error.issues, [
                [
                    `File "${fixturePath}/src/shared/util.js" has shared declarations across multiple packages:`,
                    '  - "sharedValue" → pkg-a, pkg-b'
                ]
                    .join('\n')
            ]);
        } else {
            assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
        }
    });
});
