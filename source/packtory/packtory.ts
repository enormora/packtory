import { Result } from 'true-myth';
import type { PacktoryConfig } from '../config/config.js';
import { validateConfig } from '../config/validation.js';
import type { Scheduler, PartialError } from './scheduler.js';
import type { BuildAndPublishResult, PackageProcessor } from './package-processor.js';

type Options = {
    readonly dryRun: boolean;
};

type ConfigError = {
    type: 'config';
    issues: readonly string[];
};

export type PublishFailure = ConfigError | (PartialError & { type: 'partial' });
export type PublishAllResult = Result<readonly BuildAndPublishResult[], PublishFailure>;

export type Packtory = {
    buildAndPublishAll(
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- we treat the config as unknown but want to provide autocompletion to the client
        config: PacktoryConfig | unknown,
        options: Options
    ): Promise<PublishAllResult>;
};

type PacktoryDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: Scheduler;
};
export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { packageProcessor, scheduler } = dependencies;

    return {
        async buildAndPublishAll(config, options) {
            const result = validateConfig(config);

            if (result.isErr) {
                return Result.err({
                    type: 'config',
                    issues: result.error
                });
            }

            const runResult = await scheduler.runForEachScheduledPackage(result.value, async (buildOptions) => {
                if (options.dryRun) {
                    return packageProcessor.tryBuildAndPublish(buildOptions);
                }
                return packageProcessor.buildAndPublish(buildOptions);
            });

            if (runResult.isErr) {
                return Result.err({
                    type: 'partial',
                    ...runResult.error
                });
            }

            return Result.ok(runResult.value);
        }
    };
}
