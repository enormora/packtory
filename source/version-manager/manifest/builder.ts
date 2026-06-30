import type { PackageJson } from 'type-fest';
import { hasProp, isDefined, isEmpty, pickBy } from 'remeda';
import type { VersionedBundle, BundlePackageJson } from '../versioned-bundle.ts';

type SideEffectsValue = readonly string[] | false;
type PackageJsonSideEffectsValue = NonNullable<PackageJson['sideEffects']>;

function resolveSideEffectsValue(bundle: VersionedBundle): SideEffectsValue | undefined {
    if (hasProp(bundle.additionalAttributes, 'sideEffects')) {
        return undefined;
    }
    const field = bundle.sideEffectsField;
    if (field === undefined) {
        return undefined;
    }
    if (field === false) {
        return false;
    }
    return Array.from(field);
}

type PackageJsonImports = NonNullable<PackageJson['imports']>;
type PackageJsonBin = Readonly<Record<string, string>> | string;
type VersionedBundleBinField = Readonly<Record<string, string | undefined>> | string | undefined;

function buildSideEffectsEntry(
    sideEffects: SideEffectsValue | undefined
): Record<PropertyKey, never> | { readonly sideEffects: PackageJsonSideEffectsValue; } {
    if (sideEffects === undefined) {
        return {};
    }
    if (sideEffects === false) {
        return { sideEffects: false };
    }
    return { sideEffects: Array.from(sideEffects) };
}

function toPackageJsonImports(importsField: NonNullable<VersionedBundle['importsField']>): PackageJsonImports {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- config validation constrains imports values to JSON-compatible package.json data
    return Object.fromEntries(Object.entries(importsField)) as PackageJsonImports;
}

function buildImportsEntry(
    importsField: VersionedBundle['importsField']
): Record<PropertyKey, never> | { readonly imports: PackageJsonImports; } {
    return importsField === undefined ? {} : { imports: toPackageJsonImports(importsField) };
}

function toPackageJsonBinTargets(
    binField: Exclude<NonNullable<VersionedBundleBinField>, string>
): Readonly<Record<string, string>> {
    return pickBy(binField, isDefined);
}

function buildBinEntry(
    binField: VersionedBundleBinField
): Record<PropertyKey, never> | { readonly bin: PackageJsonBin; } {
    if (binField === undefined) {
        return {};
    }

    if (typeof binField === 'string') {
        return { bin: binField };
    }

    return { bin: toPackageJsonBinTargets(binField) };
}

export function buildPackageManifest(bundle: VersionedBundle): BundlePackageJson {
    const sideEffects = resolveSideEffectsValue(bundle);
    const sideEffectsEntry = buildSideEffectsEntry(sideEffects);
    const importsEntry = buildImportsEntry(bundle.importsField);
    const binEntry = buildBinEntry(bundle.binField);

    const packageJson: BundlePackageJson = {
        ...bundle.additionalAttributes,
        exports: bundle.exportsField,
        name: bundle.name,
        version: bundle.version,
        type: bundle.packageType,
        ...sideEffectsEntry,
        ...importsEntry,
        ...binEntry,
        ...!isEmpty(bundle.dependencies) && { dependencies: bundle.dependencies },
        ...!isEmpty(bundle.peerDependencies) && { peerDependencies: bundle.peerDependencies }
    };

    return packageJson;
}
