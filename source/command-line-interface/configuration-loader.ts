import path from 'node:path';
import { hasProp as hasProperty, isPlainObject } from 'remeda';

export type ConfigurationLoaderDependencies = {
    readonly currentWorkingDirectory: string;
    importModule: (modulePath: string) => Promise<unknown>;
};

export type ConfigurationLoader = {
    load: () => Promise<unknown>;
};

type UnknownFunction = (...inputArguments: readonly unknown[]) => unknown;

function isFunction(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}

function unwrapConfigurationModule(module: Readonly<Record<PropertyKey, unknown>>): unknown {
    if (hasProperty(module, 'configuration')) {
        return module.configuration;
    }

    if (hasProperty(module, 'buildConfiguration')) {
        const { buildConfiguration } = module;
        if (isFunction(buildConfiguration)) {
            return buildConfiguration();
        }

        throw new Error('Named export of "buildConfiguration" config file is not a function');
    }

    throw new Error('Config file doesn’t have a named export "configuration" nor "buildConfiguration"');
}

async function loadConfigurationModule(
    configurationFilePath: string,
    importModule: (modulePath: string) => Promise<unknown>
): Promise<unknown> {
    const module = await importModule(configurationFilePath);

    if (!isPlainObject(module)) {
        throw new Error('Invalid config file');
    }

    return unwrapConfigurationModule(module);
}

export function createConfigurationLoader(dependencies: ConfigurationLoaderDependencies): ConfigurationLoader {
    const { currentWorkingDirectory, importModule } = dependencies;

    async function loadPacktoryConfiguration(): Promise<unknown> {
        const configurationFilePath = path.join(currentWorkingDirectory, 'packtory.config.js');
        return loadConfigurationModule(configurationFilePath, importModule);
    }

    return { load: loadPacktoryConfiguration };
}
