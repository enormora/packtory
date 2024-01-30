import path from 'node:path';
import { isReadonlyRecord } from 'effect/Predicate';
import { has, type ReadonlyRecord } from 'effect/ReadonlyRecord';

export type ConfigLoaderDependencies = {
    readonly currentWorkingDirectory: string;
    importModule(modulePath: string): Promise<unknown>;
};

export type ConfigLoader = {
    load(): Promise<unknown>;
};

type UnknownFunction = (...args: unknown[]) => unknown;

function isFunction(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}

export function createConfigLoader(dependencies: ConfigLoaderDependencies): ConfigLoader {
    const { currentWorkingDirectory, importModule } = dependencies;

    async function importConfigModule(): Promise<ReadonlyRecord<unknown>> {
        const configFilePath = path.join(currentWorkingDirectory, 'packtory.config.js');
        const module = await importModule(configFilePath);

        if (!isReadonlyRecord(module)) {
            throw new Error('Invalid config file');
        }

        return module;
    }

    return {
        async load() {
            const module = await importConfigModule();

            if (has(module, 'config')) {
                return module.config;
            }

            if (has(module, 'buildConfig')) {
                const { buildConfig } = module;
                if (isFunction(buildConfig)) {
                    return buildConfig();
                }

                throw new Error('Named export of "buildConfig" config file is not a function');
            }

            throw new Error('Config file doesn’t have a named export "config" nor "buildConfig"');
        }
    };
}
