import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import { resolveAndLinkAll } from '../../source/packages/packtory/packtory.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';
import type { PacktoryConfigWithoutRegistry } from '../../source/config/config.ts';

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
                entryPoints: [
                    {
                        js: path.join(fixturePath, 'src/pkg-a/index.js')
                    }
                ]
            },
            {
                name: 'pkg-b',
                entryPoints: [
                    {
                        js: path.join(fixturePath, 'src/pkg-b/index.js')
                    }
                ]
            }
        ]
    };
}

test('resolveAndLinkAll() reports duplicated files when the rule is enabled', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: { noDuplicatedFiles: { enabled: true } }
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected resolveAndLinkAll to fail because of duplicated files');
        return;
    }

    if (result.error.type === 'checks') {
        assert.deepStrictEqual(result.error.issues, [
            `File "${fixturePath}/src/shared/util.js" is included in multiple packages: pkg-a, pkg-b`
        ]);
    } else {
        assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }
});

test('resolveAndLinkAll succeeds when checks are disabled', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const config = await createBaseConfig(fixturePath);

    const result = await resolveAndLinkAll(config);

    if (!result.isOk) {
        assert.fail('Duplicated file rule should not run when disabled');
    }

    assert.strictEqual(result.value.length, 2);
});

test('resolveAndLinkAll succeeds when the global allowList covers the duplicated file', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const sharedFile = `${fixturePath}/src/shared/util.js`;
    const config = {
        ...baseConfig,
        checks: { noDuplicatedFiles: { enabled: true, allowList: [sharedFile] } }
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isOk) {
        assert.fail('Globally allow-listed shared file should not fail checks');
    }

    assert.strictEqual(result.value.length, 2);
});

test('resolveAndLinkAll succeeds when every owner consents to the duplicated file', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const sharedFile = `${fixturePath}/src/shared/util.js`;
    const config = {
        ...baseConfig,
        checks: { noDuplicatedFiles: { enabled: true } },
        packages: baseConfig.packages.map((packageConfig) => {
            return {
                ...packageConfig,
                checks: { noDuplicatedFiles: { allowList: [sharedFile] } }
            };
        })
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isOk) {
        assert.fail('Owners that all consent to the shared file should not fail checks');
    }

    assert.strictEqual(result.value.length, 2);
});

test('resolveAndLinkAll reports a colliding targetFilePath inside a bundle', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const collidingSource = path.join(fixturePath, 'package.json');
    const config = {
        ...baseConfig,
        checks: { uniqueTargetPaths: { enabled: true } },
        packages: [
            {
                ...baseConfig.packages[0]!,
                additionalFiles: [{ sourceFilePath: collidingSource, targetFilePath: 'pkg-a/index.js' }]
            },
            baseConfig.packages[1]!
        ]
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected resolveAndLinkAll to fail because of a colliding target path');
        return;
    }

    if (result.error.type === 'checks') {
        assert.strictEqual(result.error.issues.length, 1);
        assert.match(result.error.issues[0]!, /^Package "pkg-a" maps multiple sources to "pkg-a\/index.js":/u);
    } else if (result.error.type === 'partial') {
        const failureMessages = result.error.error.failures.map((failure) => failure.message).join('; ');
        assert.fail(`Resolve/link failed unexpectedly: ${failureMessages}`);
    } else {
        assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }
});

test('resolveAndLinkAll reports an external dependency that is only declared in devDependencies', async () => {
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
                entryPoints: [{ js: path.join(fixturePath, 'src/entry.js') }]
            }
        ]
    };

    const result = await resolveAndLinkAll(config);

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

test('resolveAndLinkAll reports a declared bundleDependency that is never imported', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/independent-packages');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: { noUnusedBundleDependencies: { enabled: true } },
        packages: [baseConfig.packages[1]!, { ...baseConfig.packages[0]!, bundleDependencies: ['pkg-b'] }]
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected resolveAndLinkAll to fail because pkg-a does not import from pkg-b');
        return;
    }

    if (result.error.type === 'checks') {
        assert.deepStrictEqual(result.error.issues, ['Unused bundle dependency "pkg-b" declared by package "pkg-a"']);
    } else {
        assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }
});

test('resolveAndLinkAll reports a per-package bundle size override that is exceeded', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: { maxBundleSize: { enabled: true, bytes: 10_000 } },
        packages: [
            {
                ...baseConfig.packages[0]!,
                checks: { maxBundleSize: { bytes: 1 } }
            },
            baseConfig.packages[1]!
        ]
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected resolveAndLinkAll to fail because pkg-a exceeds its size override');
        return;
    }

    if (result.error.type === 'checks') {
        assert.strictEqual(result.error.issues.length, 1);
        assert.match(
            result.error.issues[0]!,
            /^Package "pkg-a" exceeds the maximum bundle size: \d+ bytes \(limit: 1 bytes\)$/u
        );
    } else {
        assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }
});

test('resolveAndLinkAll reports a missing required file for every bundle that lacks it', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: { requiredFiles: { enabled: true, files: ['LICENSE'] } }
    };

    const result = await resolveAndLinkAll(config);

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

test('resolveAndLinkAll reports the duplicate when one owner does not consent', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const sharedFile = `${fixturePath}/src/shared/util.js`;
    const config = {
        ...baseConfig,
        checks: { noDuplicatedFiles: { enabled: true } },
        packages: [
            {
                ...baseConfig.packages[0]!,
                checks: { noDuplicatedFiles: { allowList: [sharedFile] } }
            },
            baseConfig.packages[1]!
        ]
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected resolveAndLinkAll to fail because pkg-b did not consent');
        return;
    }

    if (result.error.type === 'checks') {
        assert.deepStrictEqual(result.error.issues, [
            `File "${sharedFile}" is included in multiple packages: pkg-a, pkg-b`
        ]);
    } else {
        assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }
});
