import assert from 'node:assert';
import { suite, test } from 'mocha';
import { checkBundle, fakeCheckRules } from '../test-libraries/check-fixtures.ts';
import { createCheckRunner, type CheckRunner } from './check-runner.ts';

type CheckRunnerInput = Parameters<CheckRunner>[0];

function checkInput(overrides: Partial<CheckRunnerInput> = {}): CheckRunnerInput {
    return {
        settings: {},
        publishedPackages: undefined,
        perPackageSettings: new Map(),
        packageConfigs: {},
        bundles: [ checkBundle('a', [ 'shared.ts' ]), checkBundle('b', [ 'shared.ts' ]) ],
        ...overrides
    };
}

suite('check-runner', function () {
    test('does not invoke any rule when settings are empty', async function () {
        const issues = await createCheckRunner({ rules: fakeCheckRules() })(checkInput());

        assert.deepStrictEqual(issues, []);
    });

    test('dispatches an enabled rule with the provided bundles and aggregates its issues', async function () {
        const issues = await createCheckRunner({ rules: fakeCheckRules() })(
            checkInput({ settings: { noDuplicatedFiles: { enabled: true } } })
        );

        assert.deepStrictEqual(issues, [ 'File "shared.ts" is included in multiple packages: a, b' ]);
    });

    test('threads per-package settings through to the rule for cross-package consent decisions', async function () {
        const consent = { noDuplicatedFiles: { allowList: [ 'shared.ts' ] } };
        const issues = await createCheckRunner({ rules: fakeCheckRules() })(
            checkInput({
                settings: { noDuplicatedFiles: { enabled: true } },
                perPackageSettings: new Map([
                    [ 'a', consent ],
                    [ 'b', consent ]
                ])
            })
        );

        assert.deepStrictEqual(issues, []);
    });

    test('aggregates the issues of every configured rule', async function () {
        const issues = await createCheckRunner({ rules: fakeCheckRules() })(
            checkInput({
                settings: {
                    noDuplicatedFiles: { enabled: true },
                    requiredFiles: { enabled: true, files: [ 'readme.md' ] }
                }
            })
        );

        assert.deepStrictEqual(issues, [
            'File "shared.ts" is included in multiple packages: a, b',
            'Package "a" is missing required file "readme.md"',
            'Package "b" is missing required file "readme.md"'
        ]);
    });
});
