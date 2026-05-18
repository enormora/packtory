/* eslint-disable @typescript-eslint/consistent-type-assertions -- test inputs use `as never` to shape narrow partial configs without spelling out every schema field */
import assert from 'node:assert';
import { test } from 'mocha';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from './config.ts';
import { validateAllowScriptsConsistency, validatePublishSettingsArePlaced } from './settings-validation.ts';

function pkg(overrides: Partial<PackageConfig>): PackageConfig {
    return {
        name: 'pkg-a',
        roots: { main: { js: 'index.js' } },
        sourcesFolder: 'src',
        ...overrides
    } as unknown as PackageConfig;
}

function config(overrides: Partial<PacktoryConfigWithoutRegistry>): PacktoryConfigWithoutRegistry {
    return { packages: [], ...overrides } as unknown as PacktoryConfigWithoutRegistry;
}

test('validatePublishSettingsArePlaced returns no issues when commonPackageSettings.publishSettings is provided', () => {
    const result = validatePublishSettingsArePlaced(
        config({
            commonPackageSettings: { publishSettings: { access: 'public' } } as never,
            packages: [pkg({})]
        })
    );

    assert.deepStrictEqual(result, []);
});

test('validatePublishSettingsArePlaced returns no issues when every package declares publishSettings individually', () => {
    const result = validatePublishSettingsArePlaced(
        config({
            packages: [
                pkg({ publishSettings: { access: 'public' } as never }),
                pkg({ name: 'pkg-b', publishSettings: { access: 'public' } as never })
            ]
        })
    );

    assert.deepStrictEqual(result, []);
});

test('validatePublishSettingsArePlaced reports when publishSettings is missing from a package and from commonPackageSettings', () => {
    const result = validatePublishSettingsArePlaced(
        config({
            packages: [pkg({ publishSettings: { access: 'public' } as never }), pkg({ name: 'pkg-b' })]
        })
    );

    assert.deepStrictEqual(result, ['publishSettings must be set in commonPackageSettings or in every package']);
});

test('validateAllowScriptsConsistency returns no issues when no package contributes a scripts attribute', () => {
    const result = validateAllowScriptsConsistency(config({ packages: [pkg({})] }));

    assert.deepStrictEqual(result, []);
});

test('validateAllowScriptsConsistency requires allowScripts when a package adds scripts via additionalPackageJsonAttributes', () => {
    const result = validateAllowScriptsConsistency(
        config({
            packages: [
                pkg({
                    additionalPackageJsonAttributes: { scripts: { build: 'tsc' } } as never,
                    publishSettings: { access: 'public' } as never
                })
            ]
        })
    );

    assert.deepStrictEqual(result, [
        'Package "pkg-a": "scripts" in additionalPackageJsonAttributes requires "publishSettings.allowScripts: true"'
    ]);
});

test('validateAllowScriptsConsistency permits a scripts attribute when allowScripts is true at the package level', () => {
    const result = validateAllowScriptsConsistency(
        config({
            packages: [
                pkg({
                    additionalPackageJsonAttributes: { scripts: { build: 'tsc' } } as never,
                    publishSettings: { access: 'public', allowScripts: true } as never
                })
            ]
        })
    );

    assert.deepStrictEqual(result, []);
});

test('validateAllowScriptsConsistency permits a scripts attribute when allowScripts is true via commonPackageSettings', () => {
    const result = validateAllowScriptsConsistency(
        config({
            commonPackageSettings: {
                publishSettings: { access: 'public', allowScripts: true }
            } as never,
            packages: [pkg({ additionalPackageJsonAttributes: { scripts: { build: 'tsc' } } as never })]
        })
    );

    assert.deepStrictEqual(result, []);
});
