import assert from 'node:assert';
import fc from 'fast-check';
import { test } from 'mocha';
import { createConfigLoader } from './config-loader.ts';

async function expectFailure(action: () => Promise<unknown>): Promise<void> {
    try {
        await action();
        assert.fail('Expected the action to throw an error');
    } catch (error: unknown) {
        assert.ok(error instanceof Error);
    }
}

function createLoader(moduleValue: unknown) {
    return createConfigLoader({
        currentWorkingDirectory: '/workspace',
        importModule: async () => {
            return moduleValue;
        }
    });
}

test('load() rejects malformed module export shapes', async () => {
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
            async (moduleValue) => {
                await expectFailure(async () => {
                    await createLoader(moduleValue).load();
                });
            }
        )
    );
});

test('load() rejects objects without config and buildConfig exports', async () => {
    await fc.assert(
        fc.asyncProperty(fc.dictionary(fc.string(), fc.anything(), { maxKeys: 4 }), async (moduleValue) => {
            if ('config' in moduleValue || 'buildConfig' in moduleValue) {
                return;
            }

            await expectFailure(async () => {
                await createLoader(moduleValue).load();
            });
        })
    );
});

test('load() rejects non-function buildConfig exports when config is absent', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.anything().filter((value) => {
                return typeof value !== 'function';
            }),
            async (buildConfig) => {
                await expectFailure(async () => {
                    await createLoader({ buildConfig }).load();
                });
            }
        )
    );
});
