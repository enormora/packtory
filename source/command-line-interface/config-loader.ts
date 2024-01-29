import path from 'node:path';
import { isReadonlyRecord } from 'effect/Predicate';
import { has } from 'effect/ReadonlyRecord';

export type ConfigLoaderDependencies = {
    readonly currentWorkingDirectory: string;
    importModule(modulePath: string): Promise<unknown>;
};

export type ConfigLoader = {
    load(): Promise<unknown>;
};

export function createConfigLoader(dependencies: ConfigLoaderDependencies): ConfigLoader {
    const { currentWorkingDirectory, importModule } = dependencies;

    return {
        async load() {
            const configFilePath = path.join(currentWorkingDirectory, 'packtory.config.js');
            const module = await importModule(configFilePath);

            if (!isReadonlyRecord(module)) {
                throw new Error('Invalid config file');
            }

            if (!has(module, 'config')) {
                throw new Error('Config file doesn’t have a named export "config"');
            }

            return module.config;
        }
    };
}
