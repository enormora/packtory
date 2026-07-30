import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fakeCheckRuleDependencies } from '../../test-libraries/check-fixtures.ts';
import { createAllRules, type AllCheckRules } from './registry.ts';

function allRules(): AllCheckRules {
    return createAllRules(fakeCheckRuleDependencies());
}

suite('registry', function () {
    test('createAllRules() exposes the eight well-known check rules by name', function () {
        const names = allRules()
            .map(function (rule) {
                return rule.name;
            })
            .toSorted(function (left, right) {
                return left.localeCompare(right);
            });
        assert.deepStrictEqual(names, [
            'maxBundleSize',
            'noDevDependencyImports',
            'noDuplicatedFiles',
            'noSideEffects',
            'noUnusedBundleDependencies',
            'requiredFiles',
            'typeScriptIntegrity',
            'uniqueTargetPaths'
        ]);
    });

    test('createAllRules() contains no duplicate rule names', function () {
        const names = allRules().map(function (rule) {
            return rule.name;
        });
        const uniqueNames = new Set(names);
        assert.strictEqual(uniqueNames.size, names.length);
    });

    test('every created rule exposes the rule contract (name, schemas, run)', function () {
        for (const rule of allRules()) {
            assert.strictEqual(typeof rule.name, 'string', `name should be a string for ${rule.name}`);
            assert.strictEqual(typeof rule.run, 'function', `run should be a function for ${rule.name}`);
            assert.strictEqual(typeof rule.globalSchema.safeParse, 'function');
            assert.strictEqual(typeof rule.perPackageSchema.safeParse, 'function');
        }
    });
});
