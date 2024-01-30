import { Result } from 'true-myth';
import type { PacktoryConfig } from '../config/config.js';
import { validateConfig } from '../config/validation.js';
import type { PublishResult, Publisher } from '../publisher/publisher.js';
import type { Scheduler, PartialError } from './scheduler.js';

type Options = {
    readonly dryRun: boolean;
};

type ConfigError = {
    type: 'config';
    issues: readonly string[];
};

export type PublishFailure = ConfigError | (PartialError & { type: 'partial' });

export type Packtory = {
    buildAndPublishAll(
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- we treat the config as unknown but want to provide autocompletion to the client
        config: PacktoryConfig | unknown,
        options: Options
    ): Promise<Result<readonly PublishResult[], PublishFailure>>;
};

type PacktoryDependencies = {
    readonly publisher: Publisher;
    readonly scheduler: Scheduler;
};
export function createPacktory(dependencies: PacktoryDependencies): Packtory {
    const { publisher, scheduler } = dependencies;
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
                    return publisher.tryBuildAndPublish(buildOptions);
                }
                return publisher.buildAndPublish(buildOptions);
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
