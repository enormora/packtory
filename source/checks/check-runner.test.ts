import assert from 'node:assert';
import { suite, test } from 'mocha';
import { checkBundle } from '../test-libraries/check-bundle-fixture.ts';
import { runChecks } from './check-runner.ts';

suite('check-runner', function () {
    test('does not invoke any rule when settings are empty', function () {
        const issues = runChecks({
            settings: {},
            perPackageSettings: new Map(),
            packageConfigs: {},
            bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
        });

        assert.deepStrictEqual(issues, []);
    });

    test('dispatches an enabled rule with the provided bundles and aggregates its issues', function () {
        const issues = runChecks({
            settings: { noDuplicatedFiles: { enabled: true } },
            perPackageSettings: new Map(),
            packageConfigs: {},
            bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
        });

        assert.deepStrictEqual(issues, ['File "shared.ts" is included in multiple packages: a, b']);
    });

    test('threads per-package settings through to the rule for cross-package consent decisions', function () {
        const consent = { noDuplicatedFiles: { allowList: ['shared.ts'] } };
        const issues = runChecks({
            settings: { noDuplicatedFiles: { enabled: true } },
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
