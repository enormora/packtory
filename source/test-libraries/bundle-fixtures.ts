import { createFactory } from '@enormora/objectory';
import type { Except } from 'type-fest';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { BundleResource } from '../resource-resolver/resolved-bundle.ts';
import type { VersionedBundle, VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';

const transferableFileDescriptionFactory = createFactory<TransferableFileDescription>(() => {
    return {
        content: '',
        isExecutable: false,
        sourceFilePath: '',
        targetFilePath: ''
    };
});

const fileDescriptionFactory = createFactory<FileDescription>(() => {
    return {
        content: '',
        isExecutable: false,
        filePath: ''
    };
});

const bundlePackageJsonFactory = createFactory<{ readonly name: string; readonly version: string }>(() => {
    return {
        name: '',
        version: ''
    };
});

export function externalDependency(
    name: string,
    referencedFrom: readonly [string, ...(readonly string[])] = ['/src/index.js']
): ExternalDependency {
    return { name, referencedFrom };
}

export function bundleResource(
    sourceFilePath: string,
    overrides: {
        readonly content?: string;
        readonly targetFilePath?: string;
        readonly directDependencies?: ReadonlySet<string>;
        readonly isExplicitlyIncluded?: boolean;
    } = {}
): BundleResource {
    return {
        fileDescription: transferableFileDescriptionFactory.build({
            content: overrides.content ?? '',
            sourceFilePath,
            targetFilePath: overrides.targetFilePath ?? sourceFilePath.replace(/^\//u, '')
        }),
        directDependencies: overrides.directDependencies ?? new Set<string>(),
        isExplicitlyIncluded: overrides.isExplicitlyIncluded ?? false
    };
}

export function linkedBundle(overrides: Partial<LinkedBundle> = {}): LinkedBundle {
    return {
        name: 'package-a',
        contents: [],
        entryPoints: [
            {
                js: transferableFileDescriptionFactory.build({
                    sourceFilePath: '/src/index.js',
                    targetFilePath: 'index.js'
                }),
                declarationFile: transferableFileDescriptionFactory.build({
                    sourceFilePath: '/src/index.d.ts',
                    targetFilePath: 'index.d.ts'
                })
            }
        ],
        linkedBundleDependencies: new Map(),
        externalDependencies: new Map(),
        ...overrides
    };
}

type VersionedBundleOverrides = Except<Partial<VersionedBundle>, 'mainFile' | 'typesMainFile'> & {
    readonly mainFile?: Partial<TransferableFileDescription>;
    readonly typesMainFile?: Partial<TransferableFileDescription>;
};

export function versionedBundle(overrides: VersionedBundleOverrides = {}): VersionedBundle {
    const { mainFile, typesMainFile, ...rest } = overrides;
    return {
        name: '',
        version: '',
        contents: [],
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        packageType: 'module',
        mainFile: transferableFileDescriptionFactory.build(mainFile),
        ...(typesMainFile === undefined
            ? {}
            : { typesMainFile: transferableFileDescriptionFactory.build(typesMainFile) }),
        ...rest
    };
}

type VersionedBundleWithManifestOverrides = VersionedBundleOverrides & {
    readonly manifestFile?: Partial<FileDescription>;
    readonly packageJson?: { readonly name?: string; readonly version?: string };
};

export function versionedBundleWithManifest(
    overrides: VersionedBundleWithManifestOverrides = {}
): VersionedBundleWithManifest {
    const { manifestFile, packageJson, ...rest } = overrides;
    return {
        ...versionedBundle(rest),
        manifestFile: fileDescriptionFactory.build(manifestFile),
        packageJson: bundlePackageJsonFactory.build(packageJson)
    };
}
