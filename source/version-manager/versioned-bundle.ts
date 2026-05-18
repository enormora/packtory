import type { Except } from 'type-fest';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { AdditionalPackageJsonAttributes, MainPackageJson } from '../config/package-json.ts';
import type {
    PublishedPackage,
    PublishedPackageJson,
    PublishedPackageWithManifest
} from '../published-package/published-package.ts';
import { buildBinField } from '../package-surface/bin-field.ts';
import { buildExportsField } from '../package-surface/export-map.ts';
import { buildOptionalVersionedBundleFields } from './optional-bundle-fields.ts';
import { resolveRepresentativeRoot } from './representative-root.ts';
import { distributeDependencies } from './dependencies/versioned-bundle-dependencies.ts';
import { buildImportsField } from './imports/versioned-bundle-imports.ts';

export type BundlePackageJson = PublishedPackageJson;
type VersionedDependency = Pick<PublishedPackage, 'name' | 'version'>;

export type VersionedBundle = Except<PublishedPackage, 'contents'> & Pick<AnalyzedBundle, 'contents'>;
export type VersionedBundleWithManifest = Pick<PublishedPackageWithManifest, 'manifestFile' | 'packageJson'> &
    VersionedBundle;

export type BuildVersionedBundleOptions = {
    readonly bundle: AnalyzedBundle;
    readonly version: string;
    readonly mainPackageJson: MainPackageJson;
    readonly bundleDependencies: readonly VersionedDependency[];
    readonly bundlePeerDependencies: readonly VersionedDependency[];
    readonly additionalPackageJsonAttributes: AdditionalPackageJsonAttributes;
    readonly allowMutableSpecifiers: readonly string[];
    readonly substitutionPublicModuleSourcePaths?: ReadonlySet<string> | undefined;
};

export function buildVersionedBundle(options: BuildVersionedBundleOptions): VersionedBundle {
    const { bundle, version, mainPackageJson, additionalPackageJsonAttributes } = options;

    const distributedDependencies = distributeDependencies(options);
    const importsField = buildImportsField(bundle, mainPackageJson);
    const exportsField = buildExportsField(bundle, options.substitutionPublicModuleSourcePaths ?? new Set<string>());
    const binField = buildBinField(bundle);
    const representativeRoot = resolveRepresentativeRoot(bundle);
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
