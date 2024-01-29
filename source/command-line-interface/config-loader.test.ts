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

test('throws when the imported module is an object but has no config property', async (t) => {
    const importModule = fake.resolves({ something: 'but not config' });
    const configLoader = configLoaderFactory({ importModule });

    await t.throwsAsync(configLoader.load(), { message: 'Config file doesn’t have a named export "config"' });
});

test('returns the value of the config property', async (t) => {
    const importModule = fake.resolves({ config: 'the-value' });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    t.is(result, 'the-value');
});
