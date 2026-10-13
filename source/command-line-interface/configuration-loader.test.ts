import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { createConfigurationLoader, type ConfigurationLoader } from './configuration-loader.ts';

type Overrides = {
    readonly currentWorkingDirectory?: string;
    readonly importModule?: SinonSpy;
};

function configurationLoaderFactory(overrides: Overrides = {}): ConfigurationLoader {
    const { currentWorkingDirectory = 'any-directory', importModule = fake.resolves(undefined) } = overrides;
    return createConfigurationLoader({ currentWorkingDirectory, importModule });
}

suite('config-loader', function () {
    test('loads the packtory.config.js file relative to the current working directory', async function () {
        const importModule = fake.resolves({ configuration: 'foo' });
        const configurationLoader = configurationLoaderFactory({ currentWorkingDirectory: 'the-folder', importModule });

        await configurationLoader.load();

        assertDeepSubset(importModule, {
            callCount: 1,
            firstCall: {
                arguments: [ 'the-folder/packtory.config.js' ]
            }
        });
    });

    test('throws when the imported module is not an object', async function () {
        const importModule = fake.resolves('foo');
        const configurationLoader = configurationLoaderFactory({ importModule });

        try {
            await configurationLoader.load();
            assert.fail('Expected load() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Invalid config file');
        }
    });

    test('throws when the imported module is an object but has no config nor buildConfiguration property', async function () {
        const importModule = fake.resolves({ something: 'but not config' });
        const configurationLoader = configurationLoaderFactory({ importModule });

        try {
            await configurationLoader.load();
            assert.fail('Expected load() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Config file doesn’t have a named export "configuration" nor "buildConfiguration"'
            );
        }
    });

    test('returns the value of the config property when it exists and buildConfiguration doesn’t exist', async function () {
        const importModule = fake.resolves({ configuration: 'the-value' });
        const configurationLoader = configurationLoaderFactory({ importModule });

        const result = await configurationLoader.load();

        assert.strictEqual(result, 'the-value');
    });

    test('returns the value of the config property when it exists and buildConfiguration exists', async function () {
        const importModule = fake.resolves({ configuration: 'the-value', buildConfiguration: fake() });
        const configurationLoader = configurationLoaderFactory({ importModule });

        const result = await configurationLoader.load();

        assert.strictEqual(result, 'the-value');
    });

    test('throws an error when config doesn’t exist but buildConfiguration does but it is not a function', async function () {
        const importModule = fake.resolves({ buildConfiguration: 'foo' });
        const configurationLoader = configurationLoaderFactory({ importModule });

        try {
            await configurationLoader.load();
            assert.fail('Expected load() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'Named export of "buildConfiguration" config file is not a function'
            );
        }
    });

    test('returns the value returned by the buildConfiguration function when it exists and config doesn’t', async function () {
        const importModule = fake.resolves({
            buildConfiguration() {
                return 'the-value-from-function';
            }
        });
        const configurationLoader = configurationLoaderFactory({ importModule });

        const result = await configurationLoader.load();

        assert.strictEqual(result, 'the-value-from-function');
    });

    test('awaits the buildConfiguration function when it returns a promise', async function () {
        const importModule = fake.resolves({
            async buildConfiguration() {
                return 'the-value-from-async-function';
            }
        });
        const configurationLoader = configurationLoaderFactory({ importModule });

        const result = await configurationLoader.load();

        assert.strictEqual(result, 'the-value-from-async-function');
    });
});
