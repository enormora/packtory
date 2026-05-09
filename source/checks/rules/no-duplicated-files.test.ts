import assert from 'node:assert';
import { test } from 'mocha';
import type { LinkedBundle } from '../../linker/linked-bundle.ts';
import type { PackageChecksSettings } from '../../config/config.ts';
import { checkBundle } from '../../test-libraries/check-bundle-fixture.ts';
import { noDuplicatedFilesRule } from './no-duplicated-files.ts';

function bundle(name: string, sourceFilePath: string): LinkedBundle {
    return checkBundle(name, [sourceFilePath]);
}

function consentMap(
    consenters: readonly (readonly [string, readonly string[]])[]
): ReadonlyMap<string, PackageChecksSettings> {
    return new Map(
        consenters.map(([name, allowList]) => {
            return [name, { noDuplicatedFiles: { allowList } }];
        })
    );
}

function runWithConsent(
    bundles: readonly LinkedBundle[],
    consenters: readonly (readonly [string, readonly string[]])[]
): readonly string[] {
    return noDuplicatedFilesRule.run({
        bundles,
        settings: { noDuplicatedFiles: { enabled: true } },
        perPackageSettings: consentMap(consenters)
    });
}

test('rule definition exposes name, schemas and a run function', () => {
    assert.strictEqual(noDuplicatedFilesRule.name, 'noDuplicatedFiles');
    assert.strictEqual(typeof noDuplicatedFilesRule.run, 'function');
    assert.notStrictEqual(noDuplicatedFilesRule.globalSchema, undefined);
    assert.notStrictEqual(noDuplicatedFilesRule.perPackageSchema, undefined);
});

test('returns no issues when settings are missing entirely', () => {
    const result = noDuplicatedFilesRule.run({
        bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
        settings: undefined,
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('returns no issues when the rule is disabled at the top level', () => {
    const result = noDuplicatedFilesRule.run({
        bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
        settings: { noDuplicatedFiles: { enabled: false } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('reports every duplicate when no per-package consent is configured', () => {
    const result = runWithConsent([bundle('b', 'shared.ts'), bundle('a', 'shared.ts')], []);

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('ignores duplicates when every owning package consents via its allowList', () => {
    const result = runWithConsent(
        [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
        [
            ['a', ['shared.ts']],
            ['b', ['shared.ts']]
        ]
    );

    assert.deepStrictEqual(result, []);
});

test('reports a duplicate when only one owner consents', () => {
    const result = runWithConsent([bundle('a', 'shared.ts'), bundle('b', 'shared.ts')], [['a', ['shared.ts']]]);

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('reports a duplicate when a third owner did not consent', () => {
    const result = runWithConsent(
        [bundle('a', 'shared.ts'), bundle('b', 'shared.ts'), bundle('c', 'shared.ts')],
        [
            ['a', ['shared.ts']],
            ['b', ['shared.ts']]
        ]
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b, c']);
});

test('does not match consent for a different file path', () => {
    const result = runWithConsent(
        [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
        [
            ['a', ['other.ts']],
            ['b', ['other.ts']]
        ]
    );

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('returns no issues when there are no duplicates', () => {
    const result = runWithConsent([bundle('a', 'a.ts'), bundle('b', 'b.ts')], []);

    assert.deepStrictEqual(result, []);
});

function runWithMixedConsent(secondOwnerSettings: PackageChecksSettings): readonly string[] {
    return noDuplicatedFilesRule.run({
        bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
        settings: { noDuplicatedFiles: { enabled: true } },
        perPackageSettings: new Map([
            ['a', { noDuplicatedFiles: { allowList: ['shared.ts'] } }],
            ['b', secondOwnerSettings]
        ])
    });
}

test('reports a duplicate when an owner has per-package settings without a noDuplicatedFiles key', () => {
    const result = runWithMixedConsent({});

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('reports a duplicate when an owner has noDuplicatedFiles without an allowList', () => {
    const result = runWithMixedConsent({ noDuplicatedFiles: {} });

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});

test('ignores duplicates when the global allowList contains the file path even without per-package consent', () => {
    const result = noDuplicatedFilesRule.run({
        bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
        settings: { noDuplicatedFiles: { enabled: true, allowList: ['shared.ts'] } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, []);
});

test('reports a duplicate that is not present in the global allowList', () => {
    const result = noDuplicatedFilesRule.run({
        bundles: [bundle('a', 'shared.ts'), bundle('b', 'shared.ts')],
        settings: { noDuplicatedFiles: { enabled: true, allowList: ['other.ts'] } },
        perPackageSettings: new Map()
    });

    assert.deepStrictEqual(result, ['File "shared.ts" is included in multiple packages: a, b']);
});
