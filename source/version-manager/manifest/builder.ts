import type { PackageJson as PackageManifest } from 'type-fest';
import { hasProp as hasProperty, isDefined, isEmpty, pickBy } from 'remeda';
import type { VersionedBundle, BundlePackageManifest } from '../versioned-bundle.ts';

type PackageManifestSideEffectsValue = NonNullable<PackageManifest['sideEffects']>;

function resolveSideEffectsValue(bundle: VersionedBundle): boolean | readonly string[] | undefined {
    if (hasProperty(bundle.additionalAttributes, 'sideEffects')) {
        return undefined;
    }
    return bundle.sideEffectsField;
}

type PackageManifestImports = NonNullable<PackageManifest['imports']>;
type PackageManifestExecutable = Readonly<Record<string, string>> | string;
type VersionedBundleExecutableField = Readonly<Record<string, string | undefined>> | string | undefined;

function buildSideEffectsEntry(
    sideEffects: boolean | readonly string[] | undefined
): Record<PropertyKey, never> | { readonly sideEffects: PackageManifestSideEffectsValue; } {
    if (sideEffects === undefined) {
        return {};
    }
    return { sideEffects: typeof sideEffects === 'boolean' ? sideEffects : Array.from(sideEffects) };
}

function toPackageManifestImports(importsField: NonNullable<VersionedBundle['importsField']>): PackageManifestImports {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- config validation constrains imports values to JSON-compatible package.json data
    return Object.fromEntries(Object.entries(importsField)) as PackageManifestImports;
}

function buildImportsEntry(
    importsField: VersionedBundle['importsField']
): Record<PropertyKey, never> | { readonly imports: PackageManifestImports; } {
    return importsField === undefined ? {} : { imports: toPackageManifestImports(importsField) };
}

function toPackageManifestExecutableTargets(
    executableField: Exclude<NonNullable<VersionedBundleExecutableField>, string>
): Readonly<Record<string, string>> {
    return pickBy(executableField, isDefined);
}

function buildExecutableEntry(
    executableField: VersionedBundleExecutableField
): Record<PropertyKey, never> | { readonly bin: PackageManifestExecutable; } {
    if (executableField === undefined) {
        return {};
    }

    if (typeof executableField === 'string') {
        return { bin: executableField };
    }

    return { bin: toPackageManifestExecutableTargets(executableField) };
}

export function buildPackageManifest(bundle: VersionedBundle): BundlePackageManifest {
    const sideEffects = resolveSideEffectsValue(bundle);
    const sideEffectsEntry = buildSideEffectsEntry(sideEffects);
    const importsEntry = buildImportsEntry(bundle.importsField);
    const executableEntry = buildExecutableEntry(bundle.executableField);

    const packageManifest: BundlePackageManifest = {
        ...bundle.additionalAttributes,
        exports: bundle.exportsField,
        name: bundle.name,
        version: bundle.version,
        type: bundle.packageType,
        ...sideEffectsEntry,
        ...importsEntry,
        ...executableEntry,
        ...isEmpty(bundle.dependencies) ? {} : { dependencies: bundle.dependencies },
        ...isEmpty(bundle.peerDependencies) ? {} : { peerDependencies: bundle.peerDependencies }
    };

    return packageManifest;
}
