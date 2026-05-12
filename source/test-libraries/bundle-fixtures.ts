import { createFactory } from '@enormora/objectory';
import type { Except } from 'type-fest';
import type { AnalyzedBundle, AnalyzedBundleResource, FileAnalysis } from '../dead-code-eliminator/analyzed-bundle.ts';
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

type BundlePackageJsonFixture = {
    readonly name: string;
    readonly version: string;
    readonly repository?: string | { readonly type: string; readonly url: string; readonly directory?: string };
};

const bundlePackageJsonFactory = createFactory<BundlePackageJsonFixture>(() => {
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

type AnalyzedBundleResourceOverrides = {
    readonly content?: string;
    readonly targetFilePath?: string;
    readonly directDependencies?: ReadonlySet<string>;
    readonly isExplicitlyIncluded?: boolean;
    readonly isSubstituted?: boolean;
    readonly analysis?: Partial<FileAnalysis>;
};

export function analyzedBundleResource(
    sourceFilePath: string,
    overrides: AnalyzedBundleResourceOverrides = {}
): AnalyzedBundleResource {
    const base = bundleResource(sourceFilePath, {
        ...(overrides.content === undefined ? {} : { content: overrides.content }),
        ...(overrides.targetFilePath === undefined ? {} : { targetFilePath: overrides.targetFilePath }),
        ...(overrides.directDependencies === undefined ? {} : { directDependencies: overrides.directDependencies }),
        ...(overrides.isExplicitlyIncluded === undefined
            ? {}
            : { isExplicitlyIncluded: overrides.isExplicitlyIncluded })
    });
    return {
        ...base,
        isSubstituted: overrides.isSubstituted ?? false,
        analysis: {
            survivingBindings: new Set<string>(),
            sideEffectStatements: [],
            sideEffectImports: new Set<string>(),
            ...overrides.analysis
        }
    };
}

type AnalyzedBundleOverrides = Except<Partial<AnalyzedBundle>, 'contents'> & {
    readonly contents?: readonly AnalyzedBundleResource[];
};

export function analyzedBundle(overrides: AnalyzedBundleOverrides = {}): AnalyzedBundle {
    const { contents, ...rest } = overrides;
    return {
        ...linkedBundle(rest),
        contents: contents ?? [],
        sideEffectsField: rest.sideEffectsField
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
        sideEffectsField: undefined,
        mainFile: transferableFileDescriptionFactory.build(mainFile),
        ...(typesMainFile === undefined
            ? {}
            : { typesMainFile: transferableFileDescriptionFactory.build(typesMainFile) }),
        ...rest
    };
}

type VersionedBundleWithManifestOverrides = VersionedBundleOverrides & {
    readonly manifestFile?: Partial<FileDescription>;
    readonly packageJson?: Partial<BundlePackageJsonFixture>;
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
