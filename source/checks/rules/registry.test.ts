import assert from 'node:assert';
import { suite, test } from 'mocha';
import { allRules } from './registry.ts';

suite('registry', function () {
    test('allRules exposes the eight well-known check rules by name', function () {
        const names = allRules
            .map(function (rule) {
                return rule.name;
            })
            .toSorted(function (left, right) {
                return left.localeCompare(right);
            });
        assert.deepStrictEqual(names, [
            'areTheTypesWrong',
            'maxBundleSize',
            'noDevDependencyImports',
            'noDuplicatedFiles',
            'noSideEffects',
            'noUnusedBundleDependencies',
            'requiredFiles',
            'uniqueTargetPaths'
        ]);
    });

    test('allRules contains no duplicate rule names', function () {
        const names = allRules.map(function (rule) {
            return rule.name;
        });
        const uniqueNames = new Set(names);
        assert.strictEqual(uniqueNames.size, names.length);
    });

    test('every entry in allRules exposes the rule contract (name, schemas, run)', function () {
        for (const rule of allRules) {
            assert.strictEqual(typeof rule.name, 'string', `name should be a string for ${rule.name}`);
            assert.ok(typeof rule.run === 'function', `run should be a function for ${rule.name}`);
            assert.strictEqual(typeof rule.globalSchema.safeParse, 'function');
            assert.strictEqual(typeof rule.perPackageSchema.safeParse, 'function');
        }
    });
});
