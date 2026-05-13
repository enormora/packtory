import { createFactory } from '@enormora/objectory';
import type { Except } from 'type-fest';
import type { AnalyzedBundle, AnalyzedBundleResource, FileAnalysis } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { ExternalDependency } from '../dependency-scanner/external-dependencies.ts';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { implicitPackageSurface, type PackageSurface } from '../package-surface/surface.ts';
import type { BundleResource, RootFileDescription } from '../resource-resolver/resolved-bundle.ts';
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

function createDefaultRoot(): RootFileDescription {
    return {
        js: transferableFileDescriptionFactory.build({
            sourceFilePath: '/src/index.js',
            targetFilePath: 'index.js'
        }),
        declarationFile: transferableFileDescriptionFactory.build({
            sourceFilePath: '/src/index.d.ts',
            targetFilePath: 'index.d.ts'
        })
    };
}

function createDefaultRoots(): Readonly<Record<string, RootFileDescription>> {
    return { main: createDefaultRoot() };
}

function createDefaultSurface(): PackageSurface {
    return implicitPackageSurface('main');
}

function createDefaultEntryPoints(): readonly [RootFileDescription, ...RootFileDescription[]] {
    return [createDefaultRoot()];
}

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
        roots: createDefaultRoots(),
        entryPoints: createDefaultEntryPoints(),
        surface: createDefaultSurface(),
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
        roots: createDefaultRoots(),
        surface: createDefaultSurface(),
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        exportsField: {
            '.': { import: './index.js', types: './index.d.ts' }
        },
        packageType: 'module',
        sideEffectsField: undefined,
        mainFile: transferableFileDescriptionFactory.build(mainFile),
        ...(typesMainFile === undefined
            ? {}
            : { typesMainFile: transferableFileDescriptionFactory.build(typesMainFile) }),
        ...rest
    };
}

export function standardVersionedBundle(overrides: VersionedBundleOverrides = {}): VersionedBundle {
    return versionedBundle({
        name: 'package-a',
        version: '1.2.3',
        mainFile: {
            sourceFilePath: '/src/index.js',
            targetFilePath: 'index.js'
        },
        typesMainFile: {
            sourceFilePath: '/src/index.d.ts',
            targetFilePath: 'index.d.ts'
        },
        ...overrides
    });
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
