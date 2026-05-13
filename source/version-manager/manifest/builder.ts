import type { PackageJson } from 'type-fest';
import { isEmpty } from 'remeda';
import type { VersionedBundle, BundlePackageJson } from '../versioned-bundle.ts';

type SideEffectsValue = string[] | false;

// eslint-disable-next-line sonarjs/function-return-type -- distinct semantics for emit-false, emit-array, and omit
function resolveSideEffectsValue(bundle: VersionedBundle): SideEffectsValue | undefined {
    if (Object.hasOwn(bundle.additionalAttributes, 'sideEffects')) {
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

function buildSideEffectsEntry(
    sideEffects: SideEffectsValue | undefined
): Record<PropertyKey, never> | { sideEffects: SideEffectsValue } {
    return sideEffects === undefined ? {} : { sideEffects };
}

function toPackageJsonImports(importsField: NonNullable<VersionedBundle['importsField']>): PackageJsonImports {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- config validation constrains imports values to JSON-compatible package.json data
    return Object.fromEntries(Object.entries(importsField)) as PackageJsonImports;
}

function buildImportsEntry(
    importsField: VersionedBundle['importsField']
): Record<PropertyKey, never> | { imports: PackageJsonImports } {
    return importsField === undefined ? {} : { imports: toPackageJsonImports(importsField) };
}

function toPackageJsonBinTargets(
    binField: Exclude<NonNullable<VersionedBundle['binField']>, string>
): Readonly<Record<string, string>> {
    return Object.fromEntries(
        Object.entries(binField).flatMap(([name, target]) => {
            return target === undefined ? [] : [[name, target]];
        })
    );
}

function buildBinEntry(binField: VersionedBundle['binField']): Record<PropertyKey, never> | { bin: PackageJsonBin } {
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
        ...sideEffectsEntry,
        ...importsEntry,
        ...binEntry,
        exports: bundle.exportsField,
        name: bundle.name,
        version: bundle.version,
        type: bundle.packageType,
        ...(isEmpty(bundle.dependencies) ? {} : { dependencies: bundle.dependencies }),
        ...(isEmpty(bundle.peerDependencies) ? {} : { peerDependencies: bundle.peerDependencies })
    };

    return packageJson;
}
