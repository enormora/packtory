/* eslint-disable @typescript-eslint/consistent-type-assertions -- test inputs use `as never` / `as PacktoryConfigWithoutRegistry` to shape narrow partial configs */
import assert from 'node:assert';
import { test } from 'mocha';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from './config.ts';
import { collectPreGraphIssues, packageListToRecord } from './pre-graph-validation.ts';

function pkg(overrides: Partial<PackageConfig>): PackageConfig {
    return {
        name: 'pkg-a',
        roots: { main: { js: 'index.js' } },
        sourcesFolder: 'src',
        ...overrides
    } as unknown as PackageConfig;
}

test('packageListToRecord indexes packages by name', () => {
    const a = pkg({ name: 'a' });
    const b = pkg({ name: 'b' });

    assert.deepStrictEqual(packageListToRecord([a, b]), { a, b });
});

test('collectPreGraphIssues returns no issues for a well-formed single-package config with publishSettings on the package', () => {
    const config = {
        packages: [pkg({ publishSettings: { access: 'public' } as never })]
    } as PacktoryConfigWithoutRegistry;

    assert.deepStrictEqual(collectPreGraphIssues(config), []);
});

test('collectPreGraphIssues reports a missing publishSettings placement', () => {
    const config = { packages: [pkg({})] } as PacktoryConfigWithoutRegistry;

    assert.ok(
        collectPreGraphIssues(config).includes(
            'publishSettings must be set in commonPackageSettings or in every package'
        )
    );
});

test('collectPreGraphIssues reports a missing bundle dependency target', () => {
    const config = {
        packages: [
            pkg({
                publishSettings: { access: 'public' } as never,
                bundleDependencies: ['missing']
            })
        ]
    } as PacktoryConfigWithoutRegistry;

    assert.ok(
        collectPreGraphIssues(config).includes('Bundle dependency "missing" referenced in "pkg-a" does not exist')
    );
});

test('collectPreGraphIssues reports a root configuration violation', () => {
    const config = {
        packages: [
            pkg({
                publishSettings: { access: 'public' } as never,
                roots: { main: { js: 'index.js' }, extra: { js: 'extra.js' } }
            })
        ]
    } as PacktoryConfigWithoutRegistry;

    assert.ok(
        collectPreGraphIssues(config).includes(
            'Package "pkg-a" must define defaultModuleRoot when multiple roots exist'
        )
    );
});
