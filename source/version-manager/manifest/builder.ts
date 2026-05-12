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

export function buildPackageManifest(bundle: VersionedBundle): BundlePackageJson {
    const sideEffects = resolveSideEffectsValue(bundle);
    const sideEffectsEntry: { sideEffects?: SideEffectsValue } = sideEffects === undefined ? {} : { sideEffects };

    const packageJson: BundlePackageJson = {
        ...bundle.additionalAttributes,
        ...sideEffectsEntry,
        name: bundle.name,
        version: bundle.version,
        main: bundle.mainFile.targetFilePath,
        type: bundle.packageType,
        ...(isEmpty(bundle.dependencies) ? {} : { dependencies: bundle.dependencies }),
        ...(isEmpty(bundle.peerDependencies) ? {} : { peerDependencies: bundle.peerDependencies }),
        ...(bundle.typesMainFile === undefined ? {} : { types: bundle.typesMainFile.targetFilePath })
    };

    return packageJson;
}
