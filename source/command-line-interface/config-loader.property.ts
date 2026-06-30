import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { createConfigLoader, type ConfigLoader } from './config-loader.ts';

async function expectFailure(action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.ok(error instanceof Error);
    }
}

function createLoader(moduleValue: unknown): ConfigLoader {
    return createConfigLoader({
        currentWorkingDirectory: '/workspace',
        async importModule() {
            return moduleValue;
        }
    });
}

suite('config-loader', function () {
    test('load() rejects malformed module export shapes', async function () {
        await fc.assert(
            fc.asyncProperty(
                fc.oneof(
                    fc.boolean(),
                    fc.integer(),
                    fc.string(),
                    fc.constant(null),
                    fc.constant(undefined),
                    fc.array(fc.anything())
                ),
                async function (moduleValue) {
                    await expectFailure(async function () {
                        await createLoader(moduleValue).load();
                    });
                }
            )
        );
    });

    test('load() rejects objects without config and buildConfig exports', async function () {
        await fc.assert(
            fc.asyncProperty(fc.dictionary(fc.string(), fc.anything(), { maxKeys: 4 }), async function (moduleValue) {
                if (Object.hasOwn(moduleValue, 'config') || Object.hasOwn(moduleValue, 'buildConfig')) {
                    return;
                }

                await expectFailure(async function () {
                    await createLoader(moduleValue).load();
                });
            })
        );
    });

    test('load() rejects non-function buildConfig exports when config is absent', async function () {
        await fc.assert(
            fc.asyncProperty(
                fc.anything().filter(function (value) {
                    return typeof value !== 'function';
                }),
                async function (buildConfig) {
                    await expectFailure(async function () {
                        await createLoader({ buildConfig }).load();
                    });
                }
            )
        );
    });
});
