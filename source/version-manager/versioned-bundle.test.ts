import assert from 'node:assert';
import { test } from 'mocha';
import {
    externalDependency as createReferencedDependency,
    linkedBundle as createLinkedBundle,
    versionedBundle
} from '../test-libraries/bundle-fixtures.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import { buildVersionedBundle, type BuildVersionedBundleOptions } from './versioned-bundle.ts';

type BuildOverrides = Partial<BuildVersionedBundleOptions> & {
    readonly mainPackageJson?: MainPackageJson;
};

function buildOptions(overrides: BuildOverrides = {}): BuildVersionedBundleOptions {
    return {
        bundle: createLinkedBundle(),
        version: '1.2.3',
        mainPackageJson: { type: 'module' },
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
        allowMutableSpecifiers: [],
        ...overrides
    };
}

function expectBuildToThrow(overrides: BuildOverrides, expectedMessage: string): void {
    try {
        buildVersionedBundle(buildOptions(overrides));
        assert.fail('Expected buildVersionedBundle() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}

function expectBuildToThrowMatching(overrides: BuildOverrides, pattern: RegExp): void {
    try {
        buildVersionedBundle(buildOptions(overrides));
        assert.fail('Expected buildVersionedBundle() should fail but it did not');
    } catch (error: unknown) {
        assert.match((error as Error).message, pattern);
    }
}

test('buildVersionedBundle() uses the first entry point as the main and types files', () => {
    const result = buildVersionedBundle(buildOptions({ additionalPackageJsonAttributes: { custom: true } }));

    assert.deepStrictEqual(result, {
        name: 'package-a',
        version: '1.2.3',
        dependencies: {},
        peerDependencies: {},
        contents: [],
        mainFile: {
            sourceFilePath: '/src/index.js',
            targetFilePath: 'index.js',
            content: '',
            isExecutable: false
        },
        typesMainFile: {
            sourceFilePath: '/src/index.d.ts',
            targetFilePath: 'index.d.ts',
            content: '',
            isExecutable: false
        },
        additionalAttributes: { custom: true },
        packageType: 'module'
    });
});

test('buildVersionedBundle() groups bundle dependencies and peer dependencies by package name', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createLinkedBundle({
                linkedBundleDependencies: new Map([
                    ['bundle-dependency', createReferencedDependency('bundle-dependency')],
                    ['peer-dependency', createReferencedDependency('peer-dependency')]
                ])
            }),
            bundleDependencies: [
                versionedBundle({
                    name: 'bundle-dependency',
                    version: '2.0.0',
                    mainFile: { sourceFilePath: '/src/dep.js', targetFilePath: 'dep.js' }
                })
            ],
            bundlePeerDependencies: [
                versionedBundle({
                    name: 'peer-dependency',
                    version: '3.0.0',
                    mainFile: { sourceFilePath: '/src/peer.js', targetFilePath: 'peer.js' }
                })
            ]
        })
    );

    assert.deepStrictEqual(result.dependencies, { 'bundle-dependency': '2.0.0' });
    assert.deepStrictEqual(result.peerDependencies, { 'peer-dependency': '3.0.0' });
});

test('buildVersionedBundle() defaults both dependency maps to empty objects when there are no dependencies', () => {
    const result = buildVersionedBundle(buildOptions());

    assert.deepStrictEqual(result.dependencies, {});
    assert.deepStrictEqual(result.peerDependencies, {});
});

test('buildVersionedBundle() reads external dependency versions from dependencies and peerDependencies', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createLinkedBundle({
                externalDependencies: new Map([
                    ['left-pad', createReferencedDependency('left-pad')],
                    ['react', createReferencedDependency('react')]
                ])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: { 'left-pad': '^1.0.0' },
                peerDependencies: { react: '^19.0.0' }
            }
        })
    );

    assert.deepStrictEqual(result.dependencies, { 'left-pad': '^1.0.0' });
    assert.deepStrictEqual(result.peerDependencies, { react: '^19.0.0' });
});

test('buildVersionedBundle() throws when a bundle dependency version is missing', () => {
    expectBuildToThrow(
        {
            bundle: createLinkedBundle({
                linkedBundleDependencies: new Map([
                    ['bundle-dependency', createReferencedDependency('bundle-dependency')]
                ])
            })
        },
        'Couldn’t determine version number of bundle dependency bundle-dependency'
    );
});

test('buildVersionedBundle() throws when an external dependency version is missing from the main package.json', () => {
    expectBuildToThrow(
        {
            bundle: createLinkedBundle({
                externalDependencies: new Map([['left-pad', createReferencedDependency('left-pad')]])
            })
        },
        'Couldn’t determine version number of left-pad, because it is not listed in the main package.json'
    );
});

test('buildVersionedBundle() prefers peerDependencies over dependencies when the same external dependency exists in both', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createLinkedBundle({
                externalDependencies: new Map([['react', createReferencedDependency('react')]])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: { react: '^18.0.0' },
                peerDependencies: { react: '^19.0.0' }
            }
        })
    );

    assert.deepStrictEqual(result.peerDependencies, { react: '^19.0.0' });
    assert.deepStrictEqual(result.dependencies, {});
});

test('buildVersionedBundle() throws with a mutable-specifier message when a dep uses a git url', () => {
    const headerStart = 'Refusing to publish: 1 dependency uses a mutable specifier,';
    const headerEnd = " which bypasses the npm registry's integrity guarantees:";
    const expected = [
        `${headerStart}${headerEnd}`,
        '  - "react" → "git+https://github.com/our-fork/react#v18.0.0" (git)',
        'Add the dep name to dependencyPolicy.allowMutableSpecifiers to allow this on purpose.'
    ].join('\n');
    expectBuildToThrow(
        {
            bundle: createLinkedBundle({
                externalDependencies: new Map([['react', createReferencedDependency('react')]])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: { react: 'git+https://github.com/our-fork/react#v18.0.0' }
            }
        },
        expected
    );
});

test('buildVersionedBundle() throws with a malformed-specifier message when a dep uses workspace:', () => {
    const reason =
        'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace,' +
        ' not valid in a published manifest';
    const expected = [
        'Refusing to publish: 1 dependency has a specifier that npm cannot publish:',
        `  - "shared-utils" → "workspace:*" (${reason})`,
        'Replace with a registry version (e.g. "^1.2.3"). Mutable-specifier allow-listing does not apply here.'
    ].join('\n');
    expectBuildToThrow(
        {
            bundle: createLinkedBundle({
                externalDependencies: new Map([['shared-utils', createReferencedDependency('shared-utils')]])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: { 'shared-utils': 'workspace:*' }
            }
        },
        expected
    );
});

test('buildVersionedBundle() prefers a malformed-specifier error over a mutable one when both are present', () => {
    expectBuildToThrowMatching(
        {
            bundle: createLinkedBundle({
                externalDependencies: new Map([
                    ['shared-utils', createReferencedDependency('shared-utils')],
                    ['react', createReferencedDependency('react')]
                ])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: {
                    'shared-utils': 'workspace:*',
                    react: 'git+https://github.com/foo/bar#v1'
                }
            }
        },
        /npm cannot publish/u
    );
});

test('buildVersionedBundle() lets a mutable specifier through when its name is in allowMutableSpecifiers', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createLinkedBundle({
                externalDependencies: new Map([['react', createReferencedDependency('react')]])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: { react: 'git+https://github.com/our-fork/react#v18.0.0' }
            },
            allowMutableSpecifiers: ['react']
        })
    );

    assert.deepStrictEqual(result.dependencies, {
        react: 'git+https://github.com/our-fork/react#v18.0.0'
    });
});

test('buildVersionedBundle() throws when an allowMutableSpecifiers entry does not match any rejected dep', () => {
    const expected = [
        'Refusing to publish: 1 entry in dependencyPolicy.allowMutableSpecifiers is not in use:',
        '  - "old-vendored-pkg"',
        'Remove unused entries — they reflect stale exceptions to the integrity policy.'
    ].join('\n');
    expectBuildToThrow(
        {
            bundle: createLinkedBundle({
                externalDependencies: new Map([['left-pad', createReferencedDependency('left-pad')]])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: { 'left-pad': '^1.0.0' }
            },
            allowMutableSpecifiers: ['old-vendored-pkg']
        },
        expected
    );
});

test('buildVersionedBundle() prefers a mutable error over an unused-allow-list error when both are present', () => {
    expectBuildToThrowMatching(
        {
            bundle: createLinkedBundle({
                externalDependencies: new Map([['react', createReferencedDependency('react')]])
            }),
            mainPackageJson: {
                type: 'module',
                dependencies: { react: 'git+https://github.com/foo/bar#v1' }
            },
            allowMutableSpecifiers: ['old-vendored-pkg']
        },
        /uses a mutable specifier/u
    );
});
