import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { hasVersionProvider } from '../../config/versioning-settings.ts';
import {
    attributeChangelogSourceFiles,
    collectManifestChangelogSourceFiles,
    type ChangelogSourceAttributionDependencies
} from '../changelog-source-attribution.ts';
import type { BuildAndPublishOptions } from '../map-config.ts';
import type { VersionProviderContext } from './version-trigger.ts';

function allConfiguredChangelogSourceFiles(options: BuildAndPublishOptions): readonly string[] {
    return [
        ...options.additionalChangelogSourceFiles.sharedFiles,
        ...options.additionalChangelogSourceFiles.packageFiles
    ];
}

export async function createVersionProviderContext(
    dependencies: ChangelogSourceAttributionDependencies,
    analyzedBundle: AnalyzedBundle,
    options: BuildAndPublishOptions,
    stage: boolean
): Promise<VersionProviderContext> {
    let targetSourceFiles: readonly string[] = [];
    if (hasVersionProvider(options.versioning)) {
        const manifestChangelogSourceFiles = collectManifestChangelogSourceFiles(
            options.mainPackageJson,
            allConfiguredChangelogSourceFiles(options)
        );
        targetSourceFiles = await attributeChangelogSourceFiles(
            dependencies,
            analyzedBundle,
            manifestChangelogSourceFiles
        );
    }

    return {
        ignoredAttributionPaths: options.ignoredAttributionPaths,
        registrySettings: options.registrySettings,
        stage,
        targetSourceFiles
    };
}
