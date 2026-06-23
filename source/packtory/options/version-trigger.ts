import type { Maybe } from 'true-myth';
import type { BuildAndPublishOptions } from '../map-config.ts';
import type { VersionTrigger } from '../../progress/progress-broadcaster.ts';
import { hasVersionProvider } from '../../config/versioning-settings.ts';
import { validateManualVersion, type VersionProviderInput } from '../../config/manual-versioning-settings.ts';

export type VersionProviderContext = Pick<
    VersionProviderInput,
    'ignoredAttributionPaths' | 'registrySettings' | 'stage' | 'targetSourceFiles'
>;

export async function determineBuildVersion(
    currentVersion: Maybe<string>,
    options: BuildAndPublishOptions,
    context: VersionProviderContext
): Promise<string> {
    if (hasVersionProvider(options.versioning)) {
        return validateManualVersion(
            await options.versioning.provideVersion({
                ...context,
                packageName: options.name,
                currentVersion: currentVersion.isJust ? currentVersion.value : undefined
            })
        );
    }
    if (currentVersion.isJust) {
        return currentVersion.value;
    }
    if (!options.versioning.automatic) {
        return options.versioning.version;
    }
    return options.versioning.minimumVersion ?? '0.0.0';
}

export function shouldIncreaseVersion(currentVersion: Maybe<string>, options: BuildAndPublishOptions): boolean {
    if (!options.versioning.automatic) {
        return false;
    }
    return currentVersion.isJust || options.versioning.minimumVersion === undefined;
}

export function inferVersionTrigger(
    currentVersion: Maybe<string>,
    options: BuildAndPublishOptions,
    didBump: boolean
): VersionTrigger {
    if (didBump) {
        return 'auto-patch-bump';
    }
    if (!options.versioning.automatic) {
        return 'pinned';
    }
    if (currentVersion.isJust) {
        return 'auto-patch-bump';
    }
    if (options.versioning.minimumVersion !== undefined) {
        return 'minimum';
    }
    return 'initial';
}
