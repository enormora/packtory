import type { Logger } from '@stryker-mutator/api/logging';
import { commonTokens, declareFactoryPlugin, PluginKind, tokens } from '@stryker-mutator/api/plugin';
import { createMutationTimeoutReporter, type MutationTimeoutReporter } from './mutation-timeout-reporter.ts';

function createReporter(logger: Logger): MutationTimeoutReporter {
    return createMutationTimeoutReporter(function (message) {
        logger.error(message);
    }, process.cwd());
}

createReporter.inject = tokens(commonTokens.logger);

export const strykerPlugins = [
    declareFactoryPlugin(PluginKind.Reporter, 'mutation-timeout', createReporter)
];
