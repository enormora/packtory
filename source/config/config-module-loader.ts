import { hasProp, isPlainObject } from 'remeda';

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

export async function loadConfigModule(
    configFilePath: string,
    importModule: (modulePath: string) => Promise<unknown>
): Promise<unknown> {
    const module = await importModule(configFilePath);

    if (!isPlainObject(module)) {
        throw new Error('Invalid config file');
    }

    return unwrapConfigModule(module);
}
