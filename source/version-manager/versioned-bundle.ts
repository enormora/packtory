import type { Except } from 'type-fest';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { AdditionalPackageManifestAttributes, MainPackageManifest } from '../configuration/package-manifest.ts';
import type {
    PublishedPackage,
    PublishedPackageManifest,
    PublishedPackageWithManifest
} from '../published-package/published-package.ts';
import { buildExecutableField } from '../package-surface/executable-field.ts';
import { buildExportsField } from '../package-surface/export-map.ts';
import { buildOptionalVersionedBundleFields } from './optional-bundle-fields.ts';
import { resolveRepresentativeRoot } from './representative-root.ts';
import { distributeDependencies } from './dependencies/versioned-bundle-dependencies.ts';
import { buildImportsField } from './imports/versioned-bundle-imports.ts';

export type BundlePackageManifest = PublishedPackageManifest;
type VersionedDependency = Pick<PublishedPackage, 'name' | 'version'>;

export type VersionedBundle = Except<PublishedPackage, 'contents'> & Pick<AnalyzedBundle, 'contents'>;
type VersionedBundleManifestFields = Pick<PublishedPackageWithManifest, 'manifestFile' | 'packageManifest'>;
export type VersionedBundleWithManifest = VersionedBundle & VersionedBundleManifestFields;

export type BuildVersionedBundleOptions = {
    readonly bundle: AnalyzedBundle;
    readonly version: string;
    readonly mainPackageManifest: MainPackageManifest;
    readonly bundleDependencies: readonly VersionedDependency[];
    readonly bundlePeerDependencies: readonly VersionedDependency[];
    readonly additionalPackageManifestAttributes: AdditionalPackageManifestAttributes;
    readonly allowMutableSpecifiers: readonly string[];
    readonly substitutionPublicModuleSourcePaths?: ReadonlySet<string> | undefined;
};

export function buildVersionedBundle(options: BuildVersionedBundleOptions): VersionedBundle {
    const { bundle, version, mainPackageManifest, additionalPackageManifestAttributes } = options;

    const distributedDependencies = distributeDependencies(options);
    const importsField = buildImportsField(bundle, mainPackageManifest);
    const exportsField = buildExportsField(bundle, options.substitutionPublicModuleSourcePaths ?? new Set<string>());
    const executableField = buildExecutableField(bundle);
    const representativeRoot = resolveRepresentativeRoot(bundle);
    const mainFile = representativeRoot.javaScript;
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
        additionalAttributes: additionalPackageManifestAttributes,
        packageType: mainPackageManifest.type,
        sideEffectsField: bundle.sideEffectsField,
        ...buildOptionalVersionedBundleFields({ importsField, executableField, typesMainFile })
    };
}
