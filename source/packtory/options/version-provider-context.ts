import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import { hasVersionProvider } from '../../config/versioning-settings.ts';
import {
    attributeChangelogSourceFiles,
    type ChangelogSourceAttributionDependencies
} from '../changelog-source-attribution.ts';
import type { BuildAndPublishOptions } from '../map-config.ts';
import type { VersionProviderContext } from './version-trigger.ts';

export async function createVersionProviderContext(
    dependencies: ChangelogSourceAttributionDependencies,
    analyzedBundle: AnalyzedBundle,
    options: BuildAndPublishOptions,
    stage: boolean
): Promise<VersionProviderContext> {
    return {
        ignoredAttributionPaths: options.ignoredAttributionPaths,
        registrySettings: options.registrySettings,
        stage,
        targetSourceFiles: hasVersionProvider(options.versioning)
            ? await attributeChangelogSourceFiles(dependencies, analyzedBundle)
            : []
    };
}
