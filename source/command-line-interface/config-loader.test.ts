import assert from 'node:assert';
import { test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { createConfigLoader, type ConfigLoader } from './config-loader.ts';

type Overrides = {
    currentWorkingDirectory?: string;
    importModule?: SinonSpy;
};

function configLoaderFactory(overrides: Overrides = {}): ConfigLoader {
    const { currentWorkingDirectory = 'any-directory', importModule = fake.resolves(undefined) } = overrides;
    return createConfigLoader({ currentWorkingDirectory, importModule });
}

test('loads the packtory.config.js file relative to the current working directory', async () => {
    const importModule = fake.resolves({ config: 'foo' });
    const configLoader = configLoaderFactory({ currentWorkingDirectory: 'the-folder', importModule });

    await configLoader.load();

    assert.strictEqual(importModule.callCount, 1);
    assert.deepStrictEqual(importModule.firstCall.args, ['the-folder/packtory.config.js']);
});

test('throws when the imported module is not an object', async () => {
    const importModule = fake.resolves('foo');
    const configLoader = configLoaderFactory({ importModule });

    try {
        await configLoader.load();
        assert.fail('Expected load() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Invalid config file');
    }
});

test('throws when the imported module is an object but has no config nor buildConfig property', async () => {
    const importModule = fake.resolves({ something: 'but not config' });
    const configLoader = configLoaderFactory({ importModule });

    try {
        await configLoader.load();
        assert.fail('Expected load() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Config file doesn’t have a named export "config" nor "buildConfig"'
        );
    }
});

test('returns the value of the config property when it exists and buildConfig doesn’t exist', async () => {
    const importModule = fake.resolves({ config: 'the-value' });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    assert.strictEqual(result, 'the-value');
});

test('returns the value of the config property when it exists and buildConfig exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- ok in this case
    const importModule = fake.resolves({ config: 'the-value', buildConfig() {} });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    assert.strictEqual(result, 'the-value');
});

test('throws an error when config doesn’t exist but buildConfig does but it is not a function', async () => {
    const importModule = fake.resolves({ buildConfig: 'foo' });
    const configLoader = configLoaderFactory({ importModule });

    try {
        await configLoader.load();
        assert.fail('Expected load() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Named export of "buildConfig" config file is not a function');
    }
});

test('returns the value returned by the buildConfig function when it exists and config doesn’t', async () => {
    const importModule = fake.resolves({
        buildConfig() {
            return 'the-value-from-function';
        }
    });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    assert.strictEqual(result, 'the-value-from-function');
});

test('awaits the buildConfig function when it returns a promise', async () => {
    const importModule = fake.resolves({
        async buildConfig() {
            return 'the-value-from-async-function';
        }
    });
    const configLoader = configLoaderFactory({ importModule });

    const result = await configLoader.load();

    assert.strictEqual(result, 'the-value-from-async-function');
});
