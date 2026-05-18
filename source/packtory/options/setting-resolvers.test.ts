/* eslint-disable @typescript-eslint/consistent-type-assertions -- tests narrow PackageConfig / PacktoryConfigWithoutRegistry to the fields each resolver actually reads */
import assert from 'node:assert';
import { test } from 'mocha';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../../config/config.ts';
import type { MainPackageJson } from '../../config/package-json.ts';
import {
    buildAdditionalPackageJsonAttributes,
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

test('resolveSourcesFolder prefers the package-level sourcesFolder over commonPackageSettings', () => {
    const result = resolveSourcesFolder(
        pkg({ sourcesFolder: 'pkg-src' }),
        config({ commonPackageSettings: { sourcesFolder: 'common-src' } as never })
    );
    assert.strictEqual(result, 'pkg-src');
});

test('resolveSourcesFolder falls back to commonPackageSettings when the package omits sourcesFolder', () => {
    const result = resolveSourcesFolder(
        pkg({}),
        config({ commonPackageSettings: { sourcesFolder: 'common-src' } as never })
    );
    assert.strictEqual(result, 'common-src');
});

test('resolveSourcesFolder throws when no source folder is configured anywhere', () => {
    try {
        resolveSourcesFolder(pkg({}), config());
        assert.fail('Expected resolveSourcesFolder() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing the sources folder');
    }
});

test('resolveMainPackageJson returns the package-level mainPackageJson when defined', () => {
    const result = resolveMainPackageJson(pkg({ mainPackageJson: baseMain }), config());
    assert.deepStrictEqual(result, baseMain);
});

test('resolveMainPackageJson throws when no main package.json is configured anywhere', () => {
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

test('resolvePublishSettings throws when no publish settings are configured', () => {
    try {
        resolvePublishSettings(pkg({}), config());
        assert.fail('Expected resolvePublishSettings() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Config for package "pkg-a" is missing publish settings');
    }
});

test('resolveAllowMutableSpecifiers returns an empty array when no dependency policy is configured', () => {
    assert.deepStrictEqual(resolveAllowMutableSpecifiers(pkg({}), config()), []);
});

test('resolveAllowMutableSpecifiers prefers package-level dependency policy over commonPackageSettings', () => {
    const result = resolveAllowMutableSpecifiers(
        pkg({ dependencyPolicy: { allowMutableSpecifiers: ['react'] } as never }),
        config({ commonPackageSettings: { dependencyPolicy: { allowMutableSpecifiers: ['lodash'] } } as never })
    );
    assert.deepStrictEqual(result, ['react']);
});

test('buildAdditionalPackageJsonAttributes merges common attributes with package-level overrides', () => {
    const result = buildAdditionalPackageJsonAttributes(
        pkg({ additionalPackageJsonAttributes: { keywords: ['custom'], scripts: { build: 'tsc' } } as never }),
        config({ commonPackageSettings: { additionalPackageJsonAttributes: { keywords: ['shared'] } } as never })
    );

    assert.deepStrictEqual(result, { keywords: ['custom'], scripts: { build: 'tsc' } });
});

test('resolveIncludeSourceMapFiles defaults to false when neither level configures it', () => {
    assert.strictEqual(resolveIncludeSourceMapFiles(pkg({}), config()), false);
});

test('resolveIncludeSourceMapFiles prefers the package-level setting over commonPackageSettings', () => {
    const result = resolveIncludeSourceMapFiles(
        pkg({ includeSourceMapFiles: true }),
        config({ commonPackageSettings: { includeSourceMapFiles: false } as never })
    );
    assert.strictEqual(result, true);
});
