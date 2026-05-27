import type { Maybe } from 'true-myth';
import type { BuildAndPublishOptions } from '../map-config.ts';
import { versionTrigger, type VersionTrigger } from '../../progress/progress-broadcaster.ts';

export function determineBuildVersion(currentVersion: Maybe<string>, options: BuildAndPublishOptions): string {
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
        return versionTrigger.autoPatchBump;
    }
    if (!options.versioning.automatic) {
        return versionTrigger.pinned;
    }
    if (currentVersion.isJust) {
        return versionTrigger.autoPatchBump;
    }
    if (options.versioning.minimumVersion !== undefined) {
        return versionTrigger.minimum;
    }
    return versionTrigger.initial;
}
