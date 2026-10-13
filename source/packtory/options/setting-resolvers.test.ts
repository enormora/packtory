import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PackageConfiguration, PacktoryConfigurationWithoutRegistry } from '../../configuration/configuration.ts';
import type { MainPackageManifest } from '../../configuration/package-manifest.ts';
import {
    buildAdditionalPackageManifestAttributes,
    resolveAdditionalChangelogSourceFiles,
    resolveAllowMutableSpecifiers,
    resolveIncludeSourceMapFiles,
    resolveMainPackageManifest,
    resolvePublishSettings,
    resolveSourcesFolder
} from './setting-resolvers.ts';

function packageConfiguration(overrides: Partial<PackageConfiguration>): PackageConfiguration {
    return { name: 'package-a', roots: {}, ...overrides };
}

function configuration(
    overrides: Partial<PacktoryConfigurationWithoutRegistry> = {}
): PacktoryConfigurationWithoutRegistry {
    return { packages: [], ...overrides };
}

const baseMain: MainPackageManifest = { type: 'module' };

function registerRequiredSettingTests(): void {
    test('resolveSourcesFolder prefers the package-level sourcesFolder over commonPackageSettings', function () {
        const result = resolveSourcesFolder(
            packageConfiguration({ sourcesFolder: 'package-src' }),
            configuration({ commonPackageSettings: { sourcesFolder: 'common-src' } })
        );
        assert.strictEqual(result, 'package-src');
    });

    test('resolveSourcesFolder falls back to commonPackageSettings when the package omits sourcesFolder', function () {
        const result = resolveSourcesFolder(
            packageConfiguration({}),
            configuration({ commonPackageSettings: { sourcesFolder: 'common-src' } })
        );
        assert.strictEqual(result, 'common-src');
    });

    test('resolveSourcesFolder throws when no source folder is configured anywhere', function () {
        try {
            resolveSourcesFolder(packageConfiguration({}), configuration());
            assert.fail('Expected resolveSourcesFolder() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Config for package "package-a" is missing the sources folder'
            );
        }
    });

    test('resolveMainPackageManifest returns the package-level mainPackageManifest when defined', function () {
        const result = resolveMainPackageManifest(
            packageConfiguration({ mainPackageManifest: baseMain }),
            configuration()
        );
        assert.deepStrictEqual(result, baseMain);
    });

    test('resolveMainPackageManifest throws when no main package.json is configured anywhere', function () {
        try {
            resolveMainPackageManifest(packageConfiguration({}), configuration());
            assert.fail('Expected resolveMainPackageManifest() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Config for package "package-a" is missing the main package.json settings'
            );
        }
    });

    test('resolvePublishSettings throws when no publish settings are configured', function () {
        try {
            resolvePublishSettings(packageConfiguration({}), configuration());
            assert.fail('Expected resolvePublishSettings() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "package-a" is missing publish settings');
        }
    });
}

function registerOptionalSettingTests(): void {
    test('resolveAllowMutableSpecifiers returns an empty array when no dependency policy is configured', function () {
        assert.deepStrictEqual(resolveAllowMutableSpecifiers(packageConfiguration({}), configuration()), []);
    });

    test('resolveAllowMutableSpecifiers prefers package-level dependency policy over commonPackageSettings', function () {
        const result = resolveAllowMutableSpecifiers(
            packageConfiguration({ dependencyPolicy: { allowMutableSpecifiers: [ 'react' ] } }),
            configuration({ commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: [ 'lodash' ] } } })
        );
        assert.deepStrictEqual(result, [ 'react' ]);
    });

    test('resolveAdditionalChangelogSourceFiles keeps common and package paths separate', function () {
        const result = resolveAdditionalChangelogSourceFiles(
            packageConfiguration({ additionalChangelogSourceFiles: [ 'packages/package/package.json' ] }),
            configuration({ commonPackageSettings: { additionalChangelogSourceFiles: [ 'package-lock.json' ] } })
        );
        assert.deepStrictEqual(result, {
            packageFiles: [ 'packages/package/package.json' ],
            sharedFiles: [ 'package-lock.json' ]
        });
    });

    test('resolveAdditionalChangelogSourceFiles defaults absent common and package paths to empty lists', function () {
        const result = resolveAdditionalChangelogSourceFiles(packageConfiguration({}), configuration());

        assert.deepStrictEqual(result, {
            packageFiles: [],
            sharedFiles: []
        });
    });

    test('buildAdditionalPackageManifestAttributes merges common attributes with package-level overrides', function () {
        const result = buildAdditionalPackageManifestAttributes(
            packageConfiguration({
                additionalPackageManifestAttributes: { keywords: [ 'custom' ], scripts: { build: 'tsc' } }
            }),
            configuration({
                commonPackageSettings: { additionalPackageManifestAttributes: { keywords: [ 'shared' ] } }
            })
        );

        assert.deepStrictEqual(result, { keywords: [ 'custom' ], scripts: { build: 'tsc' } });
    });

    test('resolveIncludeSourceMapFiles defaults to false when neither level configures it', function () {
        assert.strictEqual(resolveIncludeSourceMapFiles(packageConfiguration({}), configuration()), false);
    });

    test('resolveIncludeSourceMapFiles prefers the package-level setting over commonPackageSettings', function () {
        const result = resolveIncludeSourceMapFiles(
            packageConfiguration({ includeSourceMapFiles: true }),
            configuration({ commonPackageSettings: { includeSourceMapFiles: false } })
        );
        assert.strictEqual(result, true);
    });
}

suite('setting-resolvers', function () {
    registerRequiredSettingTests();
    registerOptionalSettingTests();
});
