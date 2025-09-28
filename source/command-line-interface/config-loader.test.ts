import test from 'ava';
import { fake, type SinonSpy } from 'sinon';
import { createConfigLoader, type ConfigLoader } from './config-loader.js';

type Overrides = {
    currentWorkingDirectory?: string;
    importModule?: SinonSpy;
};

function configLoaderFactory(overrides: Overrides = {}): ConfigLoader {
    const { currentWorkingDirectory = 'any-directory', importModule = fake.resolves(undefined) } = overrides;
    return createConfigLoader({ currentWorkingDirectory, importModule });
}

test('loads the packtory.config.js file relative to the current working directory', async (t) => {
    const importModule = fake.resolves({ config: 'foo' });
    const configLoader = configLoaderFactory({ currentWorkingDirectory: 'the-folder', importModule });

    await configLoader.load();

    t.is(importModule.callCount, 1);
    t.deepEqual(importModule.firstCall.args, ['the-folder/packtory.config.js']);
});

test('throws when the imported module is not an object', async (t) => {
    const importModule = fake.resolves('foo');
    const configLoader = configLoaderFactory({ importModule });

    await t.throwsAsync(configLoader.load(), { message: 'Invalid config file' });
});

test('throws when the imported module is an object but has no config nor buildConfig property', async (t) => {
    const importModule = fake.resolves({ something: 'but not config' });
    const configLoader = configLoaderFactory({ importModule });

    await t.throwsAsync(configLoader.load(), {
        message: 'Config file doesn’t have a named export "config" nor "buildConfig"'
    });
});

test('returns the value of the config property when it exists and buildConfig doesn’t exist', async (t) => {
    const importModule = fake.resolves({ config: 'the-value' });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    t.is(result, 'the-value');
});

test('returns the value of the config property when it exists and buildConfig exists', async (t) => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- ok in this case
    const importModule = fake.resolves({ config: 'the-value', buildConfig() {} });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    t.is(result, 'the-value');
});

test('throws an error when config doesn’t exist but buildConfig does but it is not a function', async (t) => {
    const importModule = fake.resolves({ buildConfig: 'foo' });
    const configLoader = configLoaderFactory({ importModule });

    await t.throwsAsync(configLoader.load(), {
        message: 'Named export of "buildConfig" config file is not a function'
    });
});

test('returns the value returned by the buildConfig function when it exists and config doesn’t', async (t) => {
    const importModule = fake.resolves({
        buildConfig() {
            return 'the-value-from-function';
        }
    });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    t.is(result, 'the-value-from-function');
});

test('awaits the buildConfig function when it returns a promise', async (t) => {
    const importModule = fake.resolves({
        async buildConfig() {
            return 'the-value-from-async-function';
        }
    });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    t.is(result, 'the-value-from-async-function');
});
