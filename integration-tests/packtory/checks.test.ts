import path from 'node:path';
import test from 'ava';
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

test('resolveAndLinkAll() reports duplicated files when the rule is enabled', async (t) => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const baseConfig = await createBaseConfig(fixturePath);
    const config = {
        ...baseConfig,
        checks: { noDuplicatedFiles: true }
    };

    const result = await resolveAndLinkAll(config);

    if (!result.isErr) {
        t.fail('Expected resolveAndLinkAll to fail because of duplicated files');
        return;
    }

    if (result.error.type === 'checks') {
        t.deepEqual(result.error.issues, [
            `File "${fixturePath}/src/shared/util.js" is included in multiple packages: pkg-a, pkg-b`
        ]);
    } else {
        t.fail(`Expected a checks failure, but received "${result.error.type}"`);
    }
});

test('resolveAndLinkAll succeeds when checks are disabled', async (t) => {
    const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/duplicate-files');
    const config = await createBaseConfig(fixturePath);

    const result = await resolveAndLinkAll(config);

    t.true(result.isOk, 'Duplicated file rule should not run when disabled');
    if (result.isOk) {
        t.is(result.value.length, 2);
    }
});
