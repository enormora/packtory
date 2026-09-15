import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'mocha';
import { createFileManager } from '../../source/file-manager/file-manager.ts';
import {
    resolveAndLinkAll,
    type PacktoryConfig as PublicPacktoryConfig,
    type ResolvedPackage
} from '../../source/packages/packtory/packtory.entry-point.ts';
import type { PackageConfig, PacktoryConfigWithoutRegistry } from '../../source/config/config.ts';
import { assertValidDeadCodeEliminationOutput } from '../../source/test-libraries/dead-code-elimination-invariant-assertions.ts';
import { importEmittedPackageEntryWithProjectDependencies } from './emitted-package-probe.ts';

const selfPackageNames = [
    '@packtory/bootstrap-npm-package',
    '@packtory/cli',
    '@packtory/github-release-gate',
    'packtory'
];

const selfPackageImportTargets = [
    'packages/packtory/packtory.entry-point.js',
    'file-manager/file-manager.js',
    'dead-code-eliminator/imported-expression-origin.js'
];

type BuildSelfConfig = () => Promise<PublicPacktoryConfig>;

type SelfConfigModule = {
    readonly buildConfig: BuildSelfConfig;
};

function isBuildSelfConfig(value: unknown): value is BuildSelfConfig {
    return typeof value === 'function';
}

function isSelfConfigModule(value: unknown): value is SelfConfigModule {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, 'buildConfig')) {
        return false;
    }
    const candidate = value as Readonly<Record<PropertyKey, unknown>>;
    return isBuildSelfConfig(candidate.buildConfig);
}

async function loadSelfConfig(): Promise<PublicPacktoryConfig> {
    const modulePath = pathToFileURL(path.join(process.cwd(), 'packtory.config.js')).href;
    const configModule: unknown = await import(modulePath);
    if (!isSelfConfigModule(configModule)) {
        assert.fail('Expected packtory.config.js to export buildConfig()');
    }
    return configModule.buildConfig();
}

function packageWithoutChecks(packageConfig: PackageConfig): PackageConfig {
    const projectedPackageConfig = { ...packageConfig };
    delete projectedPackageConfig.checks;
    return projectedPackageConfig;
}

function selfDeadCodeEliminationConfig(config: PublicPacktoryConfig): PacktoryConfigWithoutRegistry {
    return {
        commonPackageSettings: config.commonPackageSettings,
        packages: config.packages.map(packageWithoutChecks)
    };
}

function expectOk(outcome: Awaited<ReturnType<typeof resolveAndLinkAll>>): readonly ResolvedPackage[] {
    if (!outcome.result.isOk) {
        assert.fail(`Expected resolveAndLinkAll to succeed but got error: ${JSON.stringify(outcome.result.error)}`);
    }
    return outcome.result.value;
}

function findPackage(packages: readonly ResolvedPackage[], name: string): ResolvedPackage {
    const match = packages.find(function (entry) {
        return entry.name === name;
    });
    if (match === undefined) {
        assert.fail(`Expected to find package "${name}"`);
    }
    return match;
}

function findResource(
    resolvedPackage: ResolvedPackage,
    targetFilePath: string
): ResolvedPackage['analyzedBundle']['contents'][number] {
    const match = resolvedPackage.analyzedBundle.contents.find(function (resource) {
        return resource.fileDescription.targetFilePath === targetFilePath;
    });
    if (match === undefined) {
        assert.fail(`Expected to find target file "${targetFilePath}" in bundle "${resolvedPackage.name}"`);
    }
    return match;
}

async function assertCompiledSourcesAvailable(config: PacktoryConfigWithoutRegistry): Promise<void> {
    const sourcesFolder = config.commonPackageSettings?.sourcesFolder;
    if (sourcesFolder === undefined) {
        assert.fail('Expected self-package config to declare commonPackageSettings.sourcesFolder');
    }

    const fileManager = createFileManager({ hostFileSystem: fs.promises });
    const status = await fileManager.checkDirectory(sourcesFolder);
    assert.deepStrictEqual(
        status,
        { exists: true, isDirectory: true },
        `Expected compiled sources at ${sourcesFolder}; run npx just compile first`
    );
}

function assertSelfPackageNames(packages: readonly ResolvedPackage[]): void {
    const actualNames = packages.map(function (resolvedPackage) {
        return resolvedPackage.name;
    });
    assert.deepStrictEqual(
        actualNames.toSorted(function (left, right) {
            return left.localeCompare(right);
        }),
        selfPackageNames
    );
}

function assertFileManagerPermissionExportRemains(packtory: ResolvedPackage): void {
    const permissions = findResource(packtory, 'file-manager/permissions.js');
    const fileManager = findResource(packtory, 'file-manager/file-manager.js');

    assert.ok(
        permissions.fileDescription.content.includes('function isExecutableFileMode'),
        'file-manager/permissions.js must keep isExecutableFileMode'
    );
    assert.match(
        fileManager.fileDescription.content,
        /import\s*\{\s*isExecutableFileMode\s*\}\s*from\s*["']\.\/permissions\.js["']/u
    );
}

function assertImportedExpressionOriginExportRemains(packtory: ResolvedPackage): void {
    const importedExpressionOrigin = findResource(
        packtory,
        'dead-code-eliminator/imported-expression-origin.js'
    );

    assert.ok(
        importedExpressionOrigin.fileDescription.content.includes('function arePureCallArguments'),
        'imported-expression-origin.js must keep arePureCallArguments'
    );
    assert.ok(
        importedExpressionOrigin.fileDescription.content.includes('export { arePureCallArguments }'),
        'imported-expression-origin.js must export arePureCallArguments'
    );
}

async function assertSafePacktoryEntriesImport(packtory: ResolvedPackage): Promise<void> {
    for (const targetFilePath of selfPackageImportTargets) {
        await importEmittedPackageEntryWithProjectDependencies(packtory.analyzedBundle, targetFilePath);
    }
}

suite('self-packaged dead code elimination', function () {
    test('keeps Packtory self-package output internally valid', async function () {
        const config = selfDeadCodeEliminationConfig(await loadSelfConfig());
        await assertCompiledSourcesAvailable(config);

        const packages = expectOk(await resolveAndLinkAll(config));
        const packtory = findPackage(packages, 'packtory');

        assertSelfPackageNames(packages);
        assertValidDeadCodeEliminationOutput(
            'self-packaged Packtory',
            packages.map(function (resolvedPackage) {
                return resolvedPackage.analyzedBundle;
            })
        );
        assertFileManagerPermissionExportRemains(packtory);
        assertImportedExpressionOriginExportRemains(packtory);
        await assertSafePacktoryEntriesImport(packtory);
    });
});
