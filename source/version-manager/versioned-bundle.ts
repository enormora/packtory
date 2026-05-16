import type { PackageJson, SetRequired } from 'type-fest';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../config/package-json.ts';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import { isImplicitPackageSurface } from '../package-surface/surface.ts';
import type { RootFileDescription } from '../resource-resolver/resolved-bundle.ts';
import { buildBinField, buildExportsField } from '../package-surface/modules.ts';
import { distributeDependencies } from './versioned-bundle-dependencies.ts';
import { buildImportsField, type ImportsField } from './versioned-bundle-imports.ts';

export type BundlePackageJson = Readonly<SetRequired<PackageJson, 'name' | 'version'>>;
type ExportsField = NonNullable<PackageJson['exports']>;

export type VersionedBundle = Pick<AnalyzedBundle, 'contents' | 'name' | 'roots' | 'sideEffectsField' | 'surface'> & {
    readonly version: string;
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
    readonly importsField?: ImportsField | undefined;
    readonly exportsField: ExportsField;
    readonly binField?: PackageJson['bin'] | undefined;
    readonly additionalAttributes: AdditionalPackageJsonAttributes;
    readonly mainFile: FileDescription | TransferableFileDescription;
    readonly typesMainFile?: FileDescription | TransferableFileDescription | undefined;
    readonly packageType: 'module';
};

export type VersionedBundleWithManifest = VersionedBundle & {
    readonly manifestFile: FileDescription;
    readonly packageJson: BundlePackageJson;
};

export type BuildVersionedBundleOptions = {
    readonly bundle: AnalyzedBundle;
    readonly version: string;
    readonly mainPackageJson: MainPackageJson;
    readonly bundleDependencies: readonly VersionedBundle[];
    readonly bundlePeerDependencies: readonly VersionedBundle[];
    readonly additionalPackageJsonAttributes: AdditionalPackageJsonAttributes;
    readonly allowMutableSpecifiers: readonly string[];
    readonly substitutionPublicModuleSourcePaths?: ReadonlySet<string> | undefined;
};

type ExplicitPackageInterfaceLike = {
    readonly modules?: readonly { readonly root: string }[] | undefined;
    readonly bins?: readonly { readonly root: string }[] | undefined;
};

function firstExplicitRootId(packageInterface: ExplicitPackageInterfaceLike): string | undefined {
    const firstModule = packageInterface.modules?.[0];
    if (firstModule !== undefined) {
        return firstModule.root;
    }
    const firstBin = packageInterface.bins?.[0];
    if (firstBin !== undefined) {
        return firstBin.root;
    }
    return undefined;
}

function resolveRepresentativeRootId(bundle: AnalyzedBundle): string {
    if (isImplicitPackageSurface(bundle.surface)) {
        return bundle.surface.defaultModuleRoot;
    }
    const referencedRootId = firstExplicitRootId(bundle.surface.packageInterface);
    if (referencedRootId === undefined) {
        throw new Error(`Package "${bundle.name}" explicit surface declares neither modules nor bins`);
    }
    return referencedRootId;
}

function resolveRepresentativeRoot(bundle: AnalyzedBundle, rootId: string): RootFileDescription {
    // Invariant: buildExportsField (implicit) and buildBinField (explicit) run before this
    // and throw when the referenced root is absent, so the lookup cannot return undefined.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- see invariant above
    return bundle.roots[rootId]!;
}

type OptionalVersionedBundleFields = Pick<VersionedBundle, 'binField' | 'importsField' | 'typesMainFile'>;

function buildOptionalVersionedBundleFields(params: {
    readonly importsField: ImportsField | undefined;
    readonly binField: PackageJson['bin'] | undefined;
    readonly typesMainFile: FileDescription | TransferableFileDescription | undefined;
}): OptionalVersionedBundleFields {
    const { importsField, binField, typesMainFile } = params;

    return {
        ...(importsField === undefined ? {} : { importsField }),
        ...(binField === undefined ? {} : { binField }),
        ...(typesMainFile === undefined ? {} : { typesMainFile })
    };
}

export function buildVersionedBundle(options: BuildVersionedBundleOptions): VersionedBundle {
    const { bundle, version, mainPackageJson, additionalPackageJsonAttributes } = options;

    const distributedDependencies = distributeDependencies(options);
    const importsField = buildImportsField(bundle, mainPackageJson);
    const exportsField = buildExportsField(bundle, options.substitutionPublicModuleSourcePaths ?? new Set<string>());
    const binField = buildBinField(bundle);
    const representativeRoot = resolveRepresentativeRoot(bundle, resolveRepresentativeRootId(bundle));
    const mainFile = representativeRoot.js;
    const typesMainFile = representativeRoot.declarationFile;

    return {
        name: bundle.name,
        version,
        roots: bundle.roots,
        surface: bundle.surface,
        dependencies: distributedDependencies.dependencies,
        peerDependencies: distributedDependencies.peerDependencies,
        exportsField,
        contents: bundle.contents,
        mainFile,
        additionalAttributes: additionalPackageJsonAttributes,
        packageType: mainPackageJson.type,
        sideEffectsField: bundle.sideEffectsField,
        ...buildOptionalVersionedBundleFields({ importsField, binField, typesMainFile })
    };
}
