import assert from 'node:assert';
import { test } from 'mocha';
import { checkBundle } from '../test-libraries/check-bundle-fixture.ts';
import { runChecks } from './check-runner.ts';

test('does not invoke any rule when settings are empty', () => {
    const issues = runChecks({
        settings: {},
        perPackageSettings: new Map(),
        bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
    });

    assert.deepStrictEqual(issues, []);
});

test('dispatches an enabled rule with the provided bundles and aggregates its issues', () => {
    const issues = runChecks({
        settings: { noDuplicatedFiles: { enabled: true } },
        perPackageSettings: new Map(),
        bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
    });

    assert.deepStrictEqual(issues, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('threads per-package settings through to the rule for cross-package consent decisions', () => {
    const consent = { noDuplicatedFiles: { allowList: ['shared.ts'] } };
    const issues = runChecks({
        settings: { noDuplicatedFiles: { enabled: true } },
        perPackageSettings: new Map([
            ['a', consent],
            ['b', consent]
        ]),
        bundles: [checkBundle('a', ['shared.ts']), checkBundle('b', ['shared.ts'])]
    });

    assert.deepStrictEqual(issues, []);
});
