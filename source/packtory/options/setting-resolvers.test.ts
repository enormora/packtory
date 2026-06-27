/* eslint-disable @typescript-eslint/consistent-type-assertions -- tests narrow PackageConfig / PacktoryConfigWithoutRegistry to the fields each resolver actually reads */
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

function pkg(overrides: Partial<PackageConfig>): PackageConfig {
    return { name: 'pkg-a', ...overrides } as unknown as PackageConfig;
}

function config(overrides: Partial<PacktoryConfigWithoutRegistry> = {}): PacktoryConfigWithoutRegistry {
    return { packages: [], ...overrides } as unknown as PacktoryConfigWithoutRegistry;
}

const baseMain: MainPackageJson = { type: 'module' };

suite('setting-resolvers', function () {
    test('resolveSourcesFolder prefers the package-level sourcesFolder over commonPackageSettings', function () {
        const result = resolveSourcesFolder(
            pkg({ sourcesFolder: 'pkg-src' }),
            config({ commonPackageSettings: { sourcesFolder: 'common-src' } as never })
        );
        assert.strictEqual(result, 'pkg-src');
    });

    test('resolveSourcesFolder falls back to commonPackageSettings when the package omits sourcesFolder', function () {
        const result = resolveSourcesFolder(
            pkg({}),
            config({ commonPackageSettings: { sourcesFolder: 'common-src' } as never })
        );
        assert.strictEqual(result, 'common-src');
    });

    test('resolveSourcesFolder throws when no source folder is configured anywhere', function () {
        try {
            resolveSourcesFolder(pkg({}), config());
            assert.fail('Expected resolveSourcesFolder() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing the sources folder');
        }
    });

    test('resolveMainPackageJson returns the package-level mainPackageJson when defined', function () {
        const result = resolveMainPackageJson(pkg({ mainPackageJson: baseMain }), config());
        assert.deepStrictEqual(result, baseMain);
    });

    test('resolveMainPackageJson throws when no main package.json is configured anywhere', function () {
        try {
            resolveMainPackageJson(pkg({}), config());
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
            resolvePublishSettings(pkg({}), config());
            assert.fail('Expected resolvePublishSettings() to throw but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing publish settings');
        }
    });

    test('resolveAllowMutableSpecifiers returns an empty array when no dependency policy is configured', function () {
        assert.deepStrictEqual(resolveAllowMutableSpecifiers(pkg({}), config()), []);
    });

    test('resolveAllowMutableSpecifiers prefers package-level dependency policy over commonPackageSettings', function () {
        const result = resolveAllowMutableSpecifiers(
            pkg({ dependencyPolicy: { allowMutableSpecifiers: ['react'] } as never }),
            config({ commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: ['lodash'] } } as never })
        );
        assert.deepStrictEqual(result, ['react']);
    });

    test('resolveAdditionalChangelogSourceFiles merges common and package paths', function () {
        const result = resolveAdditionalChangelogSourceFiles(
            pkg({ additionalChangelogSourceFiles: ['packages/pkg/package.json'] }),
            config({ commonPackageSettings: { additionalChangelogSourceFiles: ['package-lock.json'] } as never })
        );
        assert.deepStrictEqual(result, ['package-lock.json', 'packages/pkg/package.json']);
    });

    test('buildAdditionalPackageJsonAttributes merges common attributes with package-level overrides', function () {
        const result = buildAdditionalPackageJsonAttributes(
            pkg({ additionalPackageJsonAttributes: { keywords: ['custom'], scripts: { build: 'tsc' } } as never }),
            config({ commonPackageSettings: { additionalPackageJsonAttributes: { keywords: ['shared'] } } as never })
        );

        assert.deepStrictEqual(result, { keywords: ['custom'], scripts: { build: 'tsc' } });
    });

    test('resolveIncludeSourceMapFiles defaults to false when neither level configures it', function () {
        assert.strictEqual(resolveIncludeSourceMapFiles(pkg({}), config()), false);
    });

    test('resolveIncludeSourceMapFiles prefers the package-level setting over commonPackageSettings', function () {
        const result = resolveIncludeSourceMapFiles(
            pkg({ includeSourceMapFiles: true }),
            config({ commonPackageSettings: { includeSourceMapFiles: false } as never })
        );
        assert.strictEqual(result, true);
    });
});
