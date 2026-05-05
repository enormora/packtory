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
            mainPackageJson: await loadPackageJson(fixturePath)
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

test('resolveAndLinkAll succeeds when duplicated files are allow-listed', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [`${fixturePath}/src/shared/util.js`]
            }
        }
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isOk) {
        assert.fail('Duplicated files that are allow-listed should not fail checks');
    }

    assert.strictEqual(result.value.length, 2);
});

test('resolveAndLinkAll succeeds when a scoped allow-list entry covers all owners of the duplicated file', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [
                    {
                        filePath: `${fixturePath}/src/shared/util.js`,
                        packages: ['pkg-a', 'pkg-b']
                    }
                ]
            }
        }
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isOk) {
        assert.fail('Scoped allow-list entry covering all owners should not fail checks');
    }

    assert.strictEqual(result.value.length, 2);
});

test('resolveAndLinkAll reports the duplicate when an owner is outside the scoped allow-list entry', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        packages: [
            ...baseConfig.packages,
            {
                name: 'pkg-c',
                entryPoints: [{ js: path.join(fixturePath, 'src/pkg-c/index.js') }]
            }
        ],
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [
                    {
                        filePath: `${fixturePath}/src/shared/util.js`,
                        packages: ['pkg-a', 'pkg-b']
                    }
                ]
            }
        }
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected resolveAndLinkAll to fail because pkg-c is outside the scoped allow-list entry');
        return;
    }

    if (result.error.type === 'checks') {
        assert.deepStrictEqual(result.error.issues, [
            `File "${fixturePath}/src/shared/util.js" is included in multiple packages: pkg-a, pkg-b, pkg-c`
        ]);
    } else {
        assert.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }
});

test('resolveAndLinkAll fails validation when a scoped allow-list entry references an unknown package', async () => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [
                    {
                        filePath: `${fixturePath}/src/shared/util.js`,
                        packages: ['pkg-a', 'ghost']
                    }
                ]
            }
        }
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        assert.fail('Expected validation to fail because of the unknown package reference');
        return;
    }

    if (result.error.type === 'config') {
        assert.deepStrictEqual(result.error.issues, [
            `Allow list entry for "${fixturePath}/src/shared/util.js" references unknown package "ghost"`
        ]);
    } else {
        assert.fail(`Expected a config failure, but received "${result.error.type}"`);
    }
});
