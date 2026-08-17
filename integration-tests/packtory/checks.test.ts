import path from 'node:path';
import assert from 'node:assert';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
    if (packageConfig === undefined) {
        assert.fail('expected package config');
    }
    return packageConfig;
}

function firstIssue(issues: readonly string[]): string {
    const [ issue ] = issues;
    if (issue === undefined) {
        assert.fail('expected issue');
    }
    return issue;
}

type ExecutableFixture = {
    readonly entryFilePath: string;
    readonly fixturePath: string;
    readonly hiddenFilePath: string;
};

async function createExecutableFixture(): Promise<ExecutableFixture> {
    const fixturePath = await mkdtemp(path.join(tmpdir(), 'packtory-unexposed-executable-'));
    const sourceFolder = path.join(fixturePath, 'src');
    const entryFilePath = path.join(sourceFolder, 'index.js');
    const hiddenFilePath = path.join(sourceFolder, 'hidden.js');

    await mkdir(sourceFolder, { recursive: true });
    await writeFile(path.join(fixturePath, 'package.json'), '{"type":"module"}\n');
    await writeFile(entryFilePath, 'import "./hidden.js";\nexport const value = 1;\n');
    await writeFile(hiddenFilePath, '#!/usr/bin/env node\nconsole.log("hidden");\n');
    await chmod(hiddenFilePath, 0o755);

    return { entryFilePath, fixturePath, hiddenFilePath };
}

async function unexposedExecutableIssues(fixture: ExecutableFixture): Promise<readonly string[]> {
    const config: PacktoryConfigWithoutRegistry = {
        commonPackageSettings: {
            sourcesFolder: path.join(fixture.fixturePath, 'src'),
            mainPackageJson: await loadPackageJson(fixture.fixturePath),
            publishSettings: { access: 'public' }
        },
        checks: { noUnexposedExecutables: { enabled: true } },
        packages: [
            {
                name: 'pkg',
                roots: { main: { js: fixture.entryFilePath } }
            }
        ]
    };

    const { result } = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected resolveAndLinkAll to fail because an executable file is not exposed through bin');
    }

    if (result.error.type !== 'checks') {
        assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }

    return result.error.issues;
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

    test('resolveAndLinkAll checks substitution exports in generated package candidates', async function () {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/substitution-type-check');
        const config: PacktoryConfigWithoutRegistry = {
            commonPackageSettings: {
                sourcesFolder: path.join(fixturePath, 'src'),
                mainPackageJson: await loadPackageJson(fixturePath),
                publishSettings: { access: 'public' }
            },
            checks: { typeScriptIntegrity: { enabled: true } },
            packages: [
                {
                    name: 'pkg-a',
                    roots: {
                        main: {
                            js: path.join(fixturePath, 'src/a-entry.js'),
                            declarationFile: path.join(fixturePath, 'src/a-entry.d.ts')
                        }
                    }
                },
                {
                    name: 'pkg-b',
                    roots: {
                        main: {
                            js: path.join(fixturePath, 'src/b-entry.js'),
                            declarationFile: path.join(fixturePath, 'src/b-entry.d.ts')
                        }
                    },
                    bundleDependencies: [ 'pkg-a' ]
                }
            ]
        };

        const { result } = await resolveAndLinkAll(config);

        if (!result.isErr) {
            assert.fail('Expected resolveAndLinkAll to fail because a substitution export has no types');
            return;
        }

        if (result.error.type === 'checks') {
            assert.strictEqual(
                result.error.issues.some(function (issue) {
                    return issue.includes('pkg-a') &&
                        issue.includes('./internal.js') &&
                        issue.includes('without declaration companion');
                }),
                true
            );
        } else {
            assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
        }
    });

    suite('duplicate consent', function () {
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

    test('resolveAndLinkAll reports an executable file that is not exposed through bin', async function () {
        const fixture = await createExecutableFixture();
        try {
            assert.deepStrictEqual(await unexposedExecutableIssues(fixture), [
                [
                    `Package "pkg" ships executable file "hidden.js" from "${fixture.hiddenFilePath}" `,
                    'that is not exposed through bin'
                ]
                    .join('')
            ]);
        } finally {
            await rm(fixture.fixturePath, { recursive: true, force: true });
        }
    });
});
