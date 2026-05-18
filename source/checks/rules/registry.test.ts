/* eslint-disable @typescript-eslint/no-unnecessary-condition -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import { allRules } from './registry.ts';

test('allRules exposes the seven well-known check rules by name', () => {
    const names = allRules.map((rule) => rule.name).toSorted();
    assert.deepStrictEqual(names, [
        'maxBundleSize',
        'noDevDependencyImports',
        'noDuplicatedFiles',
        'noSideEffects',
        'noUnusedBundleDependencies',
        'requiredFiles',
        'uniqueTargetPaths'
    ]);
});

test('allRules contains no duplicate rule names', () => {
    const names = allRules.map((rule) => rule.name);
    assert.strictEqual(new Set(names).size, names.length);
});

test('every entry in allRules exposes the rule contract (name, schemas, run)', () => {
    for (const rule of allRules) {
        assert.strictEqual(typeof rule.name, 'string', `name should be a string for ${rule.name}`);
        assert.ok(typeof rule.run === 'function', `run should be a function for ${rule.name}`);
        assert.ok(rule.globalSchema !== undefined, `globalSchema should be defined for ${rule.name}`);
        assert.ok(rule.perPackageSchema !== undefined, `perPackageSchema should be defined for ${rule.name}`);
    }
});
