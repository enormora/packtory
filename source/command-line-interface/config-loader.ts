import path from 'node:path';
import { loadConfigModule } from '../config/config-module-loader.ts';

export type ConfigLoaderDependencies = {
    readonly currentWorkingDirectory: string;
    importModule: (modulePath: string) => Promise<unknown>;
};

export type ConfigLoader = {
    load: () => Promise<unknown>;
};

export function createConfigLoader(dependencies: ConfigLoaderDependencies): ConfigLoader {
    const { currentWorkingDirectory, importModule } = dependencies;

    async function loadPacktoryConfig(): Promise<unknown> {
        const configFilePath = path.join(currentWorkingDirectory, 'packtory.config.js');
        return loadConfigModule(configFilePath, importModule);
    }

    return { load: loadPacktoryConfig };
}
