import assert from 'node:assert';
import path from 'node:path';
import { fake, type SinonSpy } from 'sinon';
import { collectArtifactContents } from '../artifacts/content-collection.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { FileDescription } from '../file-manager/file-description.ts';
import {
    createPublishedArtifactSmokeGate,
    type PublishedArtifactSmokeGate,
    type PublishedArtifactSmokeGateDependencies,
    type SmokeProbeInput
} from '../packtory/published-artifact-smoke-gate.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    analyzedBundle,
    analyzedBundleResource,
    versionedBundleWithManifest
} from './bundle-fixtures.ts';

export type SmokeGateContext = {
    readonly gate: PublishedArtifactSmokeGate;
    readonly checkReadability: SinonSpy;
    readonly createTemporaryFolder: SinonSpy;
    readonly linkDirectory: SinonSpy;
    readonly removeFolder: SinonSpy;
    readonly runImportProbe: SinonSpy;
    readonly setExecutable: SinonSpy;
    readonly writeFile: SinonSpy;
};

type PackageJsonOverrides = {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
};

export const temporaryFolderPath = path.join('/repo', 'target', 'packtory-smoke');

function collectContents(
    sourcePackage: Parameters<PublishedArtifactSmokeGateDependencies['collectContents']>[0],
    prefix: string | undefined,
    extraFiles: readonly FileDescription[] = []
): readonly FileDescription[] {
    return collectArtifactContents(sourcePackage, prefix, extraFiles);
}

export function createContext(
    overrides: Partial<PublishedArtifactSmokeGateDependencies> = {}
): SmokeGateContext {
    const defaultDependencies: PublishedArtifactSmokeGateDependencies = {
        collectContents,
        fileManager: {
            checkReadability: fake.resolves({ isReadable: true }),
            setExecutable: fake.resolves(undefined),
            writeFile: fake.resolves(undefined)
        },
        createTemporaryFolder: fake.resolves(temporaryFolderPath),
        removeFolder: fake.resolves(undefined),
        linkDirectory: fake.resolves(undefined),
        runImportProbe: fake.resolves(undefined),
        dependencyLinkType: 'dir',
        repositoryFolder: '/repo'
    };
    const dependencies: PublishedArtifactSmokeGateDependencies = {
        ...defaultDependencies,
        ...overrides,
        fileManager: overrides.fileManager ?? defaultDependencies.fileManager
    };

    return {
        gate: createPublishedArtifactSmokeGate(dependencies),
        checkReadability: dependencies.fileManager.checkReadability as SinonSpy,
        createTemporaryFolder: dependencies.createTemporaryFolder as SinonSpy,
        linkDirectory: dependencies.linkDirectory as SinonSpy,
        removeFolder: dependencies.removeFolder as SinonSpy,
        runImportProbe: dependencies.runImportProbe as SinonSpy,
        setExecutable: dependencies.fileManager.setExecutable as SinonSpy,
        writeFile: dependencies.fileManager.writeFile as SinonSpy
    };
}

export function resource(targetFilePath: string, content = 'export const value = 1;'): AnalyzedBundleResource {
    return analyzedBundleResource(`/src/${targetFilePath}`, { targetFilePath, content });
}

export function sourceResource(
    inputFilePath: string,
    targetFilePath: string,
    content = 'export const value = 1;'
): AnalyzedBundleResource {
    return analyzedBundleResource(inputFilePath, { targetFilePath, content });
}

export function bundle(
    overrides: Partial<VersionedBundleWithManifest> = {}
): VersionedBundleWithManifest {
    const contents = overrides.contents ?? [ resource('index.js') ];
    const exportsField = overrides.exportsField ?? { '.': { import: './index.js' } };
    const packageName = overrides.name ?? 'package-a';
    return {
        ...versionedBundleWithManifest({
            name: packageName,
            version: '1.2.3',
            contents,
            exportsField,
            manifestFile: {
                filePath: 'package.json',
                content: JSON.stringify({
                    name: packageName,
                    version: '1.2.3',
                    type: 'module',
                    exports: exportsField
                }),
                isExecutable: false
            },
            packageJson: {
                name: packageName,
                version: '1.2.3'
            }
        }),
        ...overrides
    };
}

export function withPackageJson(
    targetBundle: VersionedBundleWithManifest,
    packageJson: PackageJsonOverrides
): VersionedBundleWithManifest {
    return {
        ...targetBundle,
        packageJson: {
            name: targetBundle.packageJson.name,
            version: targetBundle.packageJson.version,
            ...packageJson.dependencies === undefined ? {} : { dependencies: packageJson.dependencies },
            ...packageJson.peerDependencies === undefined ? {} : { peerDependencies: packageJson.peerDependencies }
        }
    };
}

export function matchingAnalyzedBundle(targetBundle: VersionedBundleWithManifest): AnalyzedBundle {
    return analyzedBundle({ name: targetBundle.name, contents: targetBundle.contents });
}

export function probeInputAt(spy: SinonSpy, index: number): SmokeProbeInput {
    return spy.getCall(index).args[0] as SmokeProbeInput;
}

export async function verify(
    gate: PublishedArtifactSmokeGate,
    targetBundle: VersionedBundleWithManifest
): Promise<void> {
    await gate.verify({
        analyzedBundle: matchingAnalyzedBundle(targetBundle),
        bundle: targetBundle,
        extraFiles: [],
        dependencyBundles: []
    });
}

export async function assertRejectsWithMessages(
    action: () => Promise<void>,
    messages: readonly string[]
): Promise<void> {
    await assert.rejects(action, function (error: unknown) {
        assert.ok(error instanceof Error);
        for (const message of messages) {
            assert.ok(error.message.includes(message));
        }
        return true;
    });
}
