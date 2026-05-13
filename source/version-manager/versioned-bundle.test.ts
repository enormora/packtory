import assert from 'node:assert';
import { test } from 'mocha';
import {
    analyzedBundle as createAnalyzedBundle,
    analyzedBundleResource,
    externalDependency as createReferencedDependency,
    standardVersionedBundle,
    versionedBundle
} from '../test-libraries/bundle-fixtures.ts';
import type { PackageInterface } from '../config/package-interface.ts';
import type { MainPackageJson } from '../config/package-json.ts';
import { buildVersionedBundle, type BuildVersionedBundleOptions } from './versioned-bundle.ts';

type BuildOverrides = Partial<BuildVersionedBundleOptions> & {
    readonly mainPackageJson?: MainPackageJson;
};

function buildOptions(overrides: BuildOverrides = {}): BuildVersionedBundleOptions {
    return {
        bundle: createAnalyzedBundle(),
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

function explicitCliBundle(packageInterface: PackageInterface) {
    return createAnalyzedBundle({
        roots: {
            cli: {
                js: {
                    sourceFilePath: '/src/cli.js',
                    targetFilePath: 'cli.js',
                    content: '#!/usr/bin/env node\nconsole.log("cli");\n',
                    isExecutable: true
                }
            }
        },
        surface: {
            mode: 'explicit',
            packageInterface
        }
    });
}

function assertCliMainFile(result: ReturnType<typeof buildVersionedBundle>): void {
    assert.deepStrictEqual(result.mainFile, {
        sourceFilePath: '/src/cli.js',
        targetFilePath: 'cli.js',
        content: '#!/usr/bin/env node\nconsole.log("cli");\n',
        isExecutable: true
    });
}

test('buildVersionedBundle() uses the first entry point as the main and types files', () => {
    const result = buildVersionedBundle(buildOptions({ additionalPackageJsonAttributes: { custom: true } }));

    assert.deepStrictEqual(result, standardVersionedBundle({ additionalAttributes: { custom: true } }));
});

test('buildVersionedBundle() groups bundle dependencies and peer dependencies by package name', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
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
    assert.strictEqual(result.importsField, undefined);
});

test('buildVersionedBundle() prefers the first explicit module root as the representative main file', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                roots: {
                    main: {
                        js: {
                            sourceFilePath: '/src/index.js',
                            targetFilePath: 'index.js',
                            content: '',
                            isExecutable: false
                        }
                    },
                    feature: {
                        js: {
                            sourceFilePath: '/src/feature.js',
                            targetFilePath: 'feature.js',
                            content: '',
                            isExecutable: false
                        },
                        declarationFile: {
                            sourceFilePath: '/src/feature.d.ts',
                            targetFilePath: 'feature.d.ts',
                            content: '',
                            isExecutable: false
                        }
                    }
                },
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        modules: [{ root: 'feature', export: '.' }]
                    }
                }
            })
        })
    );

    assert.deepStrictEqual(result.mainFile, {
        sourceFilePath: '/src/feature.js',
        targetFilePath: 'feature.js',
        content: '',
        isExecutable: false
    });
    assert.deepStrictEqual(result.typesMainFile, {
        sourceFilePath: '/src/feature.d.ts',
        targetFilePath: 'feature.d.ts',
        content: '',
        isExecutable: false
    });
});

test('buildVersionedBundle() falls back to the first explicit bin root when there are no explicit modules', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: explicitCliBundle({
                bins: [{ root: 'cli', name: 'package-a' }]
            })
        })
    );

    assertCliMainFile(result);
    assert.deepStrictEqual(result.binField, { 'package-a': './cli.js' });
    assert.strictEqual(Object.hasOwn(result, 'binField'), true);
});

test('buildVersionedBundle() ignores an empty explicit modules array before falling back to explicit bins', () => {
    const invalidExplicitPackageInterface = {
        modules: [],
        bins: [{ root: 'cli', name: 'package-a' }]
    };
    const result = buildVersionedBundle(
        buildOptions({
            bundle: explicitCliBundle(invalidExplicitPackageInterface as unknown as PackageInterface)
        })
    );

    assertCliMainFile(result);
});

test('buildVersionedBundle() uses an empty placeholder main file when no representative root exists', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- invalid test data is required to exercise the representative-root fallback
    const invalidExplicitPackageInterface = {} as never;
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                roots: {},
                surface: {
                    mode: 'explicit',
                    packageInterface: invalidExplicitPackageInterface
                }
            })
        })
    );

    assert.deepStrictEqual(result.mainFile, {
        sourceFilePath: '',
        targetFilePath: '',
        content: '',
        isExecutable: false
    });
    assert.strictEqual(result.typesMainFile, undefined);
    assert.strictEqual(Object.hasOwn(result, 'typesMainFile'), false);
    assert.strictEqual(Object.hasOwn(result, 'binField'), false);
});

test('buildVersionedBundle() emits only the used top-level imports entries for surviving local #imports', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                contents: [
                    analyzedBundleResource('/src/index.js', {
                        content: 'export { foo } from "#foo";\nexport { bar } from "#bar/qux";\n'
                    })
                ]
            }),
            mainPackageJson: {
                type: 'module',
                imports: {
                    '#foo': './src/foo.js',
                    '#bar/*': { default: './src/bar/*.js' },
                    '#unused': './src/unused.js'
                }
            }
        })
    );

    assert.deepStrictEqual(result.importsField, {
        '#foo': './src/foo.js',
        '#bar/*': { default: './src/bar/*.js' }
    });
});

test('buildVersionedBundle() prefers the most specific matching wildcard imports entry', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                contents: [
                    analyzedBundleResource('/src/index.js', {
                        content: 'export { bar } from "#foo/bar/baz";\n'
                    })
                ]
            }),
            mainPackageJson: {
                type: 'module',
                imports: {
                    '#foo/*': './src/foo/*.js',
                    '#foo/bar/*': './src/bar/*.js',
                    '#*': './src/fallback/*.js'
                }
            }
        })
    );

    assert.deepStrictEqual(result.importsField, {
        '#foo/bar/*': './src/bar/*.js'
    });
});

test('buildVersionedBundle() prefers an exact imports entry over matching wildcard entries', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                contents: [
                    analyzedBundleResource('/src/index.js', {
                        content: 'export { foo } from "#foo";\n'
                    })
                ]
            }),
            mainPackageJson: {
                type: 'module',
                imports: {
                    '#foo*': './src/wildcard.js',
                    '#*': './src/fallback.js',
                    '#foo': './src/foo.js'
                }
            }
        })
    );

    assert.deepStrictEqual(result.importsField, {
        '#foo': './src/foo.js'
    });
});

test('buildVersionedBundle() prefers an exact imports entry over matching wildcard entries regardless of key order', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                contents: [
                    analyzedBundleResource('/src/index.js', {
                        content: 'export { foo } from "#foo";\n'
                    })
                ]
            }),
            mainPackageJson: {
                type: 'module',
                imports: {
                    '#foo': './src/foo.js',
                    '#foo*': './src/wildcard.js',
                    '#*': './src/fallback.js'
                }
            }
        })
    );

    assert.deepStrictEqual(result.importsField, {
        '#foo': './src/foo.js'
    });
});

test('buildVersionedBundle() ignores #imports that only appear in non-code files', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                contents: [
                    analyzedBundleResource('/src/index.js', {
                        content: 'export { foo } from "#foo";\n'
                    }),
                    analyzedBundleResource('/src/readme.md', {
                        content: 'export { ignored } from "#readme";\n',
                        targetFilePath: 'readme.md'
                    })
                ]
            }),
            mainPackageJson: {
                type: 'module',
                imports: {
                    '#foo': './src/foo.js'
                }
            }
        })
    );

    assert.deepStrictEqual(result.importsField, {
        '#foo': './src/foo.js'
    });
});

test('buildVersionedBundle() does not emit imports for substituted files because the surviving code no longer contains #imports', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
                contents: [
                    analyzedBundleResource('/src/index.js', {
                        content: 'export { foo } from "pkg/foo.js";\n',
                        isSubstituted: true
                    })
                ]
            }),
            mainPackageJson: {
                type: 'module',
                imports: { '#foo': './src/foo.js' }
            }
        })
    );

    assert.strictEqual(result.importsField, undefined);
});

test('buildVersionedBundle() throws when surviving #imports exist but mainPackageJson.imports is missing', () => {
    expectBuildToThrow(
        {
            bundle: createAnalyzedBundle({
                contents: [analyzedBundleResource('/src/index.js', { content: 'export { foo } from "#foo";\n' })]
            })
        },
        'Found surviving package.json imports specifier "#foo" but mainPackageJson.imports is not configured'
    );
});

test('buildVersionedBundle() throws when surviving #imports exist but no matching imports entry is configured', () => {
    expectBuildToThrow(
        {
            bundle: createAnalyzedBundle({
                contents: [analyzedBundleResource('/src/index.js', { content: 'export { foo } from "#foo/bar";\n' })]
            }),
            mainPackageJson: {
                type: 'module',
                imports: { '#baz/*': './src/baz/*.js' }
            }
        },
        'Found surviving package.json imports specifier "#foo/bar" but no matching mainPackageJson.imports entry'
    );
});

test('buildVersionedBundle() throws when the matching imports entry is undefined', () => {
    expectBuildToThrow(
        {
            bundle: createAnalyzedBundle({
                contents: [analyzedBundleResource('/src/index.js', { content: 'export { foo } from "#foo";\n' })]
            }),
            mainPackageJson: {
                type: 'module',
                imports: { '#foo': undefined } as unknown as MainPackageJson['imports']
            }
        },
        'Found surviving package.json imports specifier "#foo" but matching mainPackageJson.imports entry "#foo" is undefined'
    );
});

test('buildVersionedBundle() reads external dependency versions from dependencies and peerDependencies', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
                externalDependencies: new Map([['left-pad', createReferencedDependency('left-pad')]])
            })
        },
        'Couldn’t determine version number of left-pad, because it is not listed in the main package.json'
    );
});

test('buildVersionedBundle() prefers peerDependencies over dependencies when the same external dependency exists in both', () => {
    const result = buildVersionedBundle(
        buildOptions({
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
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
            bundle: createAnalyzedBundle({
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
