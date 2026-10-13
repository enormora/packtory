import { fake } from 'sinon';
import type { PackageChecksSettings } from '../configuration/configuration.ts';
import { createCheckRunner, type CheckRunner } from '../checks/check-runner.ts';
import { createAllRules, type AllCheckRules, type CheckRuleDependencies } from '../checks/rules/registry.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';
import { createFakeFileManager } from './fake-file-manager.ts';
import { analyzedBundle, analyzedBundleResource, versionedBundleWithManifest } from './bundle-fixtures.ts';

export function checkBundle(name: string, filePaths: readonly string[]): AnalyzedBundle {
    return analyzedBundle({
        name,
        contents: filePaths.map(function (filePath) {
            return analyzedBundleResource(filePath, { targetFilePath: filePath });
        })
    });
}

export function checkPublishedPackage(
    name: string,
    manifestContent: string,
    files: Readonly<Record<string, string>>
): PublishedPackageWithManifest {
    return versionedBundleWithManifest({
        name,
        version: '0.0.0',
        manifestFile: { filePath: 'package.json', content: manifestContent },
        contents: Object.entries(files).map(function ([ filePath, content ]) {
            return analyzedBundleResource(filePath, { targetFilePath: filePath, content });
        })
    });
}

export function fakeCheckRuleDependencies(): CheckRuleDependencies {
    return {
        fileManager: createFakeFileManager(),
        analyzePackageResolution: fake.resolves({ kind: 'analyzed', entrypoints: [], problems: [] }),
        summarizeDeclarationIntegrity: fake.returns([])
    };
}

export function fakeCheckRules(): AllCheckRules {
    return createAllRules(fakeCheckRuleDependencies());
}

export function fakeCheckRunner(): CheckRunner {
    return createCheckRunner({ rules: fakeCheckRules() });
}

type EmptyCheckContext = {
    readonly sourceFolders: ReadonlyMap<string, string>;
    readonly perPackageSettings: ReadonlyMap<string, PackageChecksSettings>;
};

export function emptyCheckContext(): EmptyCheckContext {
    return { sourceFolders: new Map(), perPackageSettings: new Map() };
}
