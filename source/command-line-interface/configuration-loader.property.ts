import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { createConfigurationLoader, type ConfigurationLoader } from './configuration-loader.ts';

async function expectFailure(action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.ok(error instanceof Error);
    }
}

function createLoader(moduleValue: unknown): ConfigurationLoader {
    return createConfigurationLoader({
        currentWorkingDirectory: '/workspace',
        async importModule() {
            return moduleValue;
        }
    });
}

suite('config-loader', function () {
    test('load() rejects malformed module export shapes', async function () {
        await fastCheck.assert(
            fastCheck.asyncProperty(
                fastCheck.oneof(
                    fastCheck.boolean(),
                    fastCheck.integer(),
                    fastCheck.string(),
                    fastCheck.constant(null),
                    fastCheck.constant(undefined),
                    fastCheck.array(fastCheck.anything())
                ),
                async function (moduleValue) {
                    await expectFailure(async function () {
                        await createLoader(moduleValue).load();
                    });
                }
            )
        );
    });

    test('load() rejects objects without config and buildConfiguration exports', async function () {
        await fastCheck.assert(
            fastCheck.asyncProperty(
                fastCheck.dictionary(fastCheck.string(), fastCheck.anything(), { maxKeys: 4 }),
                async function (moduleValue) {
                    if (
                        Object.hasOwn(moduleValue, 'configuration') || Object.hasOwn(moduleValue, 'buildConfiguration')
                    ) {
                        return;
                    }

                    await expectFailure(async function () {
                        await createLoader(moduleValue).load();
                    });
                }
            )
        );
    });

    test('load() rejects non-function buildConfiguration exports when config is absent', async function () {
        await fastCheck.assert(
            fastCheck.asyncProperty(
                fastCheck.anything().filter(function (value) {
                    return typeof value !== 'function';
                }),
                async function (buildConfiguration) {
                    await expectFailure(async function () {
                        await createLoader({ buildConfiguration }).load();
                    });
                }
            )
        );
    });
});
