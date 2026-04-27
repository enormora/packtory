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
