import assert from 'node:assert';
import { test } from 'mocha';
import { Result } from 'true-myth';
import { minimalPackageConfigFactory } from '../test-libraries/config-fixtures.ts';
import { validateConfig, validateConfigWithoutRegistry } from './validation.ts';

type ConfigInput = Record<string, unknown>;

function withRegistry(extra: ConfigInput): ConfigInput {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: {
            sourcesFolder: 'foo',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        ...extra
    };
}

type CycleDependencyKind = 'bundleDependencies' | 'bundlePeerDependencies';

function packageWithDeps(name: string, kind: CycleDependencyKind, deps: readonly string[]): ConfigInput {
    return { ...minimalPackageConfigFactory.build({ name }), [kind]: deps };
}

function expectCyclicError(packages: readonly ConfigInput[], expectedPath: string): void {
    const result = validateConfig(withRegistry({ packages }));
    assert.deepStrictEqual(result, Result.err([`Unexpected cyclic dependency path: [${expectedPath}]`]));
}

function fooPackage(name = 'foo'): ConfigInput {
    return minimalPackageConfigFactory.build({ name });
}

function configWithGhostAllowList(allowListPackages: readonly string[]): ConfigInput {
    return {
        checks: {
            noDuplicatedFiles: {
                enabled: true,
                allowList: [{ filePath: 'src/shared/util.ts', packages: allowListPackages }]
            }
        },
        packages: [fooPackage('a'), fooPackage('b')]
    };
}

test('returns the issues when the given config doesn’t match the schema', () => {
    const result = validateConfig({ not: 'valid' });
    assert.deepStrictEqual(
        result,
        Result.err(['at registrySettings: missing property', 'invalid value doesn’t match expected union'])
    );
});

test('returns an issue when a package with the same name exists twice', () => {
    const result = validateConfig(withRegistry({ packages: [fooPackage(), fooPackage()] }));

    assert.deepStrictEqual(result, Result.err(['Duplicate package definition with the name "foo"']));
});

test('returns two issues when packages with the same name exists thrice', () => {
    const result = validateConfig(withRegistry({ packages: [fooPackage(), fooPackage(), fooPackage()] }));

    assert.deepStrictEqual(
        result,
        Result.err([
            'Duplicate package definition with the name "foo"',
            'Duplicate package definition with the name "foo"'
        ])
    );
});

test('returns two issues when there are two duplicated package names', () => {
    const result = validateConfig(
        withRegistry({
            packages: [fooPackage(), fooPackage(), fooPackage('bar'), fooPackage('bar')]
        })
    );

    assert.deepStrictEqual(
        result,
        Result.err([
            'Duplicate package definition with the name "foo"',
            'Duplicate package definition with the name "bar"'
        ])
    );
});

test('returns an issue when there is a cycle per bundleDependencies', () => {
    expectCyclicError(
        [packageWithDeps('a', 'bundleDependencies', ['b']), packageWithDeps('b', 'bundleDependencies', ['a'])],
        'a→b→a'
    );
});

test('returns an issue when there is a long cycle per bundleDependencies', () => {
    expectCyclicError(
        [
            packageWithDeps('a', 'bundleDependencies', ['d']),
            packageWithDeps('b', 'bundleDependencies', ['a']),
            packageWithDeps('c', 'bundleDependencies', ['b']),
            packageWithDeps('d', 'bundleDependencies', ['c'])
        ],
        'a→d→c→b→a'
    );
});

test('returns an issue when there is a cycle per bundlePeerDependencies', () => {
    expectCyclicError(
        [packageWithDeps('a', 'bundlePeerDependencies', ['b']), packageWithDeps('b', 'bundlePeerDependencies', ['a'])],
        'a→b→a'
    );
});

test('returns an issue when there is a cycle per bundleDependencies and bundlePeerDependencies', () => {
    expectCyclicError(
        [packageWithDeps('a', 'bundleDependencies', ['b']), packageWithDeps('b', 'bundlePeerDependencies', ['a'])],
        'a→b→a'
    );
});

test('returns an issue when a package depends on itself', () => {
    expectCyclicError([packageWithDeps('a', 'bundleDependencies', ['a'])], 'a→a');
});

test('returns an issue when a package bundle dependency does not exit', () => {
    const result = validateConfig(
        withRegistry({
            packages: [{ name: 'a', entryPoints: [{ js: 'foo' }], bundleDependencies: ['b'] }]
        })
    );

    assert.deepStrictEqual(result, Result.err(['Bundle dependency "b" referenced in "a" does not exist']));
});

test('returns an issue when a package bundle peer dependency does not exit', () => {
    const result = validateConfig(
        withRegistry({
            packages: [{ name: 'a', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['b'] }]
        })
    );

    assert.deepStrictEqual(result, Result.err(['Bundle peer dependency "b" referenced in "a" does not exist']));
});

test('returns multiple issues of different kind', () => {
    const result = validateConfig(
        withRegistry({
            packages: [
                packageWithDeps('a', 'bundleDependencies', ['b']),
                packageWithDeps('b', 'bundleDependencies', ['a']),
                fooPackage(),
                fooPackage()
            ]
        })
    );

    assert.deepStrictEqual(
        result,
        Result.err(['Duplicate package definition with the name "foo"', 'Unexpected cyclic dependency path: [a→b→a]'])
    );
});

const duplicateCAndMissingBPackages: readonly ConfigInput[] = [
    packageWithDeps('a', 'bundlePeerDependencies', ['b']),
    fooPackage('c'),
    fooPackage('c')
];

const duplicateCAndMissingBErrors: readonly string[] = [
    'Duplicate package definition with the name "c"',
    'Bundle peer dependency "b" referenced in "a" does not exist'
];

test('returns a missing dependency and duplicate package issue at the same time', () => {
    const result = validateConfig(withRegistry({ packages: duplicateCAndMissingBPackages }));

    assert.deepStrictEqual(result, Result.err(duplicateCAndMissingBErrors));
});

test('doesn’t report cyclic dependency issues when there is also a missing dependency', () => {
    const result = validateConfig(
        withRegistry({
            packages: [
                { name: 'a', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['b'] },
                { name: 'c', entryPoints: [{ js: 'foo' }], bundlePeerDependencies: ['c'] }
            ]
        })
    );

    assert.deepStrictEqual(result, Result.err(['Bundle peer dependency "b" referenced in "a" does not exist']));
});

test('returns an issue when a scoped allow-list entry references an unknown package', () => {
    const result = validateConfig(withRegistry(configWithGhostAllowList(['a', 'ghost'])));

    assert.deepStrictEqual(
        result,
        Result.err(['Allow list entry for "src/shared/util.ts" references unknown package "ghost"'])
    );
});

test('returns one issue per unknown package in a scoped allow-list entry', () => {
    const result = validateConfig(withRegistry(configWithGhostAllowList(['ghost', 'phantom'])));

    assert.deepStrictEqual(
        result,
        Result.err([
            'Allow list entry for "src/shared/util.ts" references unknown package "ghost"',
            'Allow list entry for "src/shared/util.ts" references unknown package "phantom"'
        ])
    );
});

test('accepts a config where checks is defined but noDuplicatedFiles is omitted', () => {
    const result = validateConfig(
        withRegistry({
            checks: {},
            packages: [{ name: 'a', entryPoints: [{ js: 'foo' }] }]
        })
    );

    assert.strictEqual(result.isOk, true);
});

test('accepts a config where checks.noDuplicatedFiles is defined without an allowList', () => {
    const result = validateConfig(
        withRegistry({
            checks: { noDuplicatedFiles: { enabled: true } },
            packages: [{ name: 'a', entryPoints: [{ js: 'foo' }] }]
        })
    );

    assert.strictEqual(result.isOk, true);
});

test('does not report unknown-package issues for plain string allow-list entries', () => {
    const result = validateConfig(
        withRegistry({
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: ['LICENSE']
                }
            },
            packages: [{ name: 'a', entryPoints: [{ js: 'foo' }] }]
        })
    );

    assert.strictEqual(result.isOk, true);
});

test('accepts a scoped allow-list entry when all referenced packages exist', () => {
    const result = validateConfig(
        withRegistry({
            checks: {
                noDuplicatedFiles: {
                    enabled: true,
                    allowList: [{ filePath: 'src/shared/util.ts', packages: ['a', 'b'] }]
                }
            },
            packages: [
                { name: 'a', entryPoints: [{ js: 'foo' }] },
                { name: 'b', entryPoints: [{ js: 'foo' }] }
            ]
        })
    );

    assert.strictEqual(result.isOk, true);
});

test('validateConfigWithoutRegistry() returns schema issues when the config is invalid', () => {
    const result = validateConfigWithoutRegistry({ not: 'valid' });

    assert.deepStrictEqual(result, Result.err(['invalid value doesn’t match expected union']));
});

test('validateConfigWithoutRegistry() returns an issue for unknown packages in a scoped allow-list entry', () => {
    const result = validateConfigWithoutRegistry({
        commonPackageSettings: {
            sourcesFolder: 'foo',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        ...configWithGhostAllowList(['a', 'ghost'])
    });

    assert.deepStrictEqual(
        result,
        Result.err(['Allow list entry for "src/shared/util.ts" references unknown package "ghost"'])
    );
});

test('validateConfigWithoutRegistry() returns duplicate and missing dependency issues', () => {
    const result = validateConfigWithoutRegistry({
        commonPackageSettings: {
            sourcesFolder: 'foo',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: duplicateCAndMissingBPackages
    });

    assert.deepStrictEqual(result, Result.err(duplicateCAndMissingBErrors));
});

function withCustomCommon(commonExtras: ConfigInput, packages: readonly ConfigInput[]): ConfigInput {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: { type: 'module' }, ...commonExtras },
        packages
    };
}

function withCommonWithoutPublishSettings(packages: readonly ConfigInput[]): ConfigInput {
    return withCustomCommon({}, packages);
}

const placementErrorMessage = 'publishSettings must be set in commonPackageSettings or in every package';
const packageSpecificPublishSettings = [
    { name: 'foo', entryPoints: [{ js: 'foo' }], publishSettings: { access: 'public' } },
    { name: 'bar', entryPoints: [{ js: 'bar' }], publishSettings: { access: 'restricted' } }
] as const;

test('returns an issue when publishSettings is missing from both commonPackageSettings and every package', () => {
    const result = validateConfig(withCommonWithoutPublishSettings([{ name: 'foo', entryPoints: [{ js: 'foo' }] }]));

    assert.deepStrictEqual(result, Result.err([placementErrorMessage]));
});

test('returns an issue when publishSettings is missing for at least one package and not provided in common', () => {
    const result = validateConfig(
        withCommonWithoutPublishSettings([
            { name: 'foo', entryPoints: [{ js: 'foo' }], publishSettings: { access: 'public' } },
            { name: 'bar', entryPoints: [{ js: 'bar' }] }
        ])
    );

    assert.deepStrictEqual(result, Result.err([placementErrorMessage]));
});

test('accepts a config when publishSettings is set only in commonPackageSettings', () => {
    const result = validateConfig(withRegistry({ packages: [{ name: 'foo', entryPoints: [{ js: 'foo' }] }] }));

    assert.strictEqual(result.isOk, true);
});

test('accepts a config when publishSettings is set only on every package', () => {
    const result = validateConfig(withCommonWithoutPublishSettings(packageSpecificPublishSettings));

    assert.strictEqual(result.isOk, true);
});

test('accepts a config when no commonPackageSettings is provided and every package supplies its own publishSettings', () => {
    const result = validateConfig({
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        packages: [
            {
                sourcesFolder: 'foo',
                mainPackageJson: { type: 'module' },
                name: 'foo',
                entryPoints: [{ js: 'foo' }],
                publishSettings: { access: 'public' }
            }
        ]
    });

    assert.strictEqual(result.isOk, true);
});

const allowScriptsErrorFor = (packageName: string): string => {
    return (
        `Package "${packageName}": "scripts" in additionalPackageJsonAttributes` +
        ' requires "publishSettings.allowScripts: true"'
    );
};

const postinstallScripts = { postinstall: 'echo hi' };

test('accepts a config without scripts anywhere', () => {
    const result = validateConfig(withRegistry({ packages: [{ name: 'foo', entryPoints: [{ js: 'foo' }] }] }));

    assert.strictEqual(result.isOk, true);
});

test('accepts a config with per-package scripts and per-package allowScripts true', () => {
    const result = validateConfig(
        withRegistry({
            packages: [
                {
                    name: 'foo',
                    entryPoints: [{ js: 'foo' }],
                    additionalPackageJsonAttributes: { scripts: postinstallScripts },
                    publishSettings: { access: 'public', allowScripts: true }
                }
            ]
        })
    );

    assert.strictEqual(result.isOk, true);
});

const publicWithAllowScripts = { publishSettings: { access: 'public', allowScripts: true } };
const commonScriptsAttribute = { additionalPackageJsonAttributes: { scripts: postinstallScripts } };
const fooPackageWithScripts: ConfigInput = {
    name: 'foo',
    entryPoints: [{ js: 'foo' }],
    additionalPackageJsonAttributes: { scripts: postinstallScripts }
};

test('accepts a config with per-package scripts and common allowScripts true', () => {
    const result = validateConfig(withCustomCommon(publicWithAllowScripts, [fooPackageWithScripts]));

    assert.strictEqual(result.isOk, true);
});

test('accepts a config with common scripts and common allowScripts true and per-package nothing', () => {
    const result = validateConfig(
        withCustomCommon({ ...commonScriptsAttribute, ...publicWithAllowScripts }, [fooPackage()])
    );

    assert.strictEqual(result.isOk, true);
});

test('accepts a config with allowScripts true but no scripts anywhere', () => {
    const result = validateConfig(withCustomCommon(publicWithAllowScripts, [fooPackage()]));

    assert.strictEqual(result.isOk, true);
});

test('rejects a config with per-package scripts and no allowScripts anywhere', () => {
    const result = validateConfig(withRegistry({ packages: [fooPackageWithScripts] }));

    assert.deepStrictEqual(result, Result.err([allowScriptsErrorFor('foo')]));
});

test('rejects every package when common scripts and no allowScripts anywhere', () => {
    const result = validateConfig(
        withCustomCommon({ ...commonScriptsAttribute, publishSettings: { access: 'public' } }, [
            fooPackage(),
            fooPackage('bar')
        ])
    );

    assert.deepStrictEqual(result, Result.err([allowScriptsErrorFor('foo'), allowScriptsErrorFor('bar')]));
});

test('rejects with both placement and allowScripts errors when scripts are set but publishSettings is missing', () => {
    const result = validateConfig(withCommonWithoutPublishSettings([fooPackageWithScripts]));

    assert.deepStrictEqual(result, Result.err([placementErrorMessage, allowScriptsErrorFor('foo')]));
});

test('rejects when common allows scripts but per-package replaces publishSettings without allowScripts', () => {
    const result = validateConfig(
        withCustomCommon({ ...commonScriptsAttribute, ...publicWithAllowScripts }, [
            { name: 'foo', entryPoints: [{ js: 'foo' }], publishSettings: { access: 'public' } }
        ])
    );

    assert.deepStrictEqual(result, Result.err([allowScriptsErrorFor('foo')]));
});
