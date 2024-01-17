import type { PacktoryConfig } from '../config/config.js';
import { validateConfig } from '../config/validation.js';
import type { Publisher } from '../publisher/publisher.js';
import type { Scheduler } from './scheduler.js';

type Options = {
    readonly dryRun: boolean;
};

type Packtory = {
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- we treat the config as unknown but want to provide autocompletion to the client
    buildAndPublishAll(config: PacktoryConfig | unknown, options: Options): Promise<void>;
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
                throw new Error(`Invalid config:\n\n - ${result.error.join('\n - ')}`);
            }

            const runResult = await scheduler.runForEachScheduledPackage(result.value, async (buildOptions) => {
                if (options.dryRun) {
                    return publisher.tryBuildAndPublish(buildOptions);
                }
                return publisher.buildAndPublish(buildOptions);
            });

            if (runResult.isErr) {
                let message = 'Some packages couldn’t be built or published while others succeeded:\n';
                message += `Succeeded: ${runResult.error.succeeded
                    .map((packageResult) => {
                        return packageResult.bundle.packageJson.name;
                    })
                    .join(', ')}\n`;
                message += `Failed: ${runResult.error.failures
                    .map((error) => {
                        return error.message;
                    })
                    .join(', ')}`;
                throw new Error(message);
            }
        }
    };
}
