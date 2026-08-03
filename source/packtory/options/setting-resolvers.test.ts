import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import type { MainPackageJson } from '../../config/package-json.ts';
import {
    buildAdditionalPackageJsonAttributes,
    resolveAdditionalChangelogSourceFiles,
    resolveAllowMutableSpecifiers,
    resolveIncludeSourceMapFiles,
    resolveMainPackageJson,
    resolvePublishSettings,
    resolveSourcesFolder
} from './setting-resolvers.ts';

function packageConfig(overrides: Partial<PackageConfig>): PackageConfig {
    return { name: 'pkg-a', roots: {}, ...overrides };
}

function config(overrides: Partial<PacktoryConfigWithoutRegistry> = {}): PacktoryConfigWithoutRegistry {
    return { packages: [], ...overrides };
}

const baseMain: MainPackageJson = { type: 'module' };

function registerRequiredSettingTests(): void {
    test('resolveSourcesFolder prefers the package-level sourcesFolder over commonPackageSettings', function () {
        const result = resolveSourcesFolder(
            packageConfig({ sourcesFolder: 'pkg-src' }),
            config({ commonPackageSettings: { sourcesFolder: 'common-src' } })
        );
        assert.strictEqual(result, 'pkg-src');
    });

    test('resolveSourcesFolder falls back to commonPackageSettings when the package omits sourcesFolder', function () {
        const result = resolveSourcesFolder(
            packageConfig({}),
            config({ commonPackageSettings: { sourcesFolder: 'common-src' } })
        );
        assert.strictEqual(result, 'common-src');
    });

    test('resolveSourcesFolder throws when no source folder is configured anywhere', function () {
        try {
            resolveSourcesFolder(packageConfig({}), config());
            assert.fail('Expected resolveSourcesFolder() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing the sources folder');
        }
    });

    test('resolveMainPackageJson returns the package-level mainPackageJson when defined', function () {
        const result = resolveMainPackageJson(packageConfig({ mainPackageJson: baseMain }), config());
        assert.deepStrictEqual(result, baseMain);
    });

    test('resolveMainPackageJson throws when no main package.json is configured anywhere', function () {
        try {
            resolveMainPackageJson(packageConfig({}), config());
            assert.fail('Expected resolveMainPackageJson() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Config for package "pkg-a" is missing the main package.json settings'
            );
        }
    });

    test('resolvePublishSettings throws when no publish settings are configured', function () {
        try {
            resolvePublishSettings(packageConfig({}), config());
            assert.fail('Expected resolvePublishSettings() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing publish settings');
        }
    });
}

function registerOptionalSettingTests(): void {
    test('resolveAllowMutableSpecifiers returns an empty array when no dependency policy is configured', function () {
        assert.deepStrictEqual(resolveAllowMutableSpecifiers(packageConfig({}), config()), []);
    });

    test('resolveAllowMutableSpecifiers prefers package-level dependency policy over commonPackageSettings', function () {
        const result = resolveAllowMutableSpecifiers(
            packageConfig({ dependencyPolicy: { allowMutableSpecifiers: [ 'react' ] } }),
            config({ commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: [ 'lodash' ] } } })
        );
        assert.deepStrictEqual(result, [ 'react' ]);
    });

    test('resolveAdditionalChangelogSourceFiles keeps common and package paths separate', function () {
        const result = resolveAdditionalChangelogSourceFiles(
            packageConfig({ additionalChangelogSourceFiles: [ 'packages/pkg/package.json' ] }),
            config({ commonPackageSettings: { additionalChangelogSourceFiles: [ 'package-lock.json' ] } })
        );
        assert.deepStrictEqual(result, {
            packageFiles: [ 'packages/pkg/package.json' ],
            sharedFiles: [ 'package-lock.json' ]
        });
    });

    test('resolveAdditionalChangelogSourceFiles defaults absent common and package paths to empty lists', function () {
        const result = resolveAdditionalChangelogSourceFiles(packageConfig({}), config());

        assert.deepStrictEqual(result, {
            packageFiles: [],
            sharedFiles: []
        });
    });

    test('buildAdditionalPackageJsonAttributes merges common attributes with package-level overrides', function () {
        const result = buildAdditionalPackageJsonAttributes(
            packageConfig({ additionalPackageJsonAttributes: { keywords: [ 'custom' ], scripts: { build: 'tsc' } } }),
            config({ commonPackageSettings: { additionalPackageJsonAttributes: { keywords: [ 'shared' ] } } })
        );

        assert.deepStrictEqual(result, { keywords: [ 'custom' ], scripts: { build: 'tsc' } });
    });

    test('resolveIncludeSourceMapFiles defaults to false when neither level configures it', function () {
        assert.strictEqual(resolveIncludeSourceMapFiles(packageConfig({}), config()), false);
    });

    test('resolveIncludeSourceMapFiles prefers the package-level setting over commonPackageSettings', function () {
        const result = resolveIncludeSourceMapFiles(
            packageConfig({ includeSourceMapFiles: true }),
            config({ commonPackageSettings: { includeSourceMapFiles: false } })
        );
        assert.strictEqual(result, true);
    });
}

suite('setting-resolvers', function () {
    registerRequiredSettingTests();
    registerOptionalSettingTests();
});
