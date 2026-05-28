import assert from 'node:assert';
import { suite, test } from 'mocha';
import { checkBundle } from '../test-libraries/check-bundle-fixture.ts';
import { runChecks } from './check-runner.ts';

suite('check-runner', function () {
    test('does not invoke any rule when settings are empty', async function () {
        const issues = await runChecks({
            settings: {},
            publishedPackages: undefined,
            perPackageSettings: new Map(),
            packageConfigs: {},
            bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
        });

        assert.deepStrictEqual(issues, []);
    });

    test('dispatches an enabled rule with the provided bundles and aggregates its issues', async function () {
        const issues = await runChecks({
            settings: { noDuplicatedFiles: { enabled: true } },
            publishedPackages: undefined,
            perPackageSettings: new Map(),
            packageConfigs: {},
            bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
        });

        assert.deepStrictEqual(issues, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('threads per-package settings through to the rule for cross-package consent decisions', async function () {
        const consent = { noDuplicatedFiles: { allowList: ['shared.ts'] } };
        const issues = await runChecks({
            settings: { noDuplicatedFiles: { enabled: true } },
            publishedPackages: undefined,
            perPackageSettings: new Map([
                ['a', consent],
                ['b', consent]
            ]),
            packageConfigs: {},
            bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
        });

        assert.deepStrictEqual(issues, []);
    });
});
