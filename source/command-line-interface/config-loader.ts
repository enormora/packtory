import path from 'node:path';
import { hasProp, isPlainObject } from 'remeda';

export type ConfigLoaderDependencies = {
    readonly currentWorkingDirectory: string;
    importModule: (modulePath: string) => Promise<unknown>;
};

export type ConfigLoader = {
    load: () => Promise<unknown>;
};

type UnknownFunction = (...args: readonly unknown[]) => unknown;

function isFunction(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}

function unwrapConfigModule(module: Readonly<Record<PropertyKey, unknown>>): unknown {
    if (hasProp(module, 'config')) {
        return module.config;
    }

    if (hasProp(module, 'buildConfig')) {
        const { buildConfig } = module;
        if (isFunction(buildConfig)) {
            return buildConfig();
        }

        throw new Error('Named export of "buildConfig" config file is not a function');
    }

    throw new Error('Config file doesn’t have a named export "config" nor "buildConfig"');
}

async function loadConfigModule(
    configFilePath: string,
    importModule: (modulePath: string) => Promise<unknown>
): Promise<unknown> {
    const module = await importModule(configFilePath);

    if (!isPlainObject(module)) {
        throw new Error('Invalid config file');
    }

    return unwrapConfigModule(module);
}

export function createConfigLoader(dependencies: ConfigLoaderDependencies): ConfigLoader {
    const { currentWorkingDirectory, importModule } = dependencies;

    async function loadPacktoryConfig(): Promise<unknown> {
        const configFilePath = path.join(currentWorkingDirectory, 'packtory.config.js');
        return loadConfigModule(configFilePath, importModule);
    }

    return { load: loadPacktoryConfig };
}
