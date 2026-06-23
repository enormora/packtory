import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { BuildAndPublishOptions } from '../map-config.ts';
import { analyzedBundle, analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { createVersionProviderContext } from './version-provider-context.ts';

suite('version-provider-context', function () {
    test('does not calculate targetSourceFiles when versioning has no provider', async function () {
        const context = await createVersionProviderContext(
            {
                fileManager: {
                    async checkReadability() {
                        throw new Error('file manager should not be used');
                    },
                    async readFile() {
                        throw new Error('file manager should not be used');
                    }
                },
                repositoryFolder: '/'
            },
            analyzedBundle({ contents: [analyzedBundleResource('/source/index.js')] }),
            {
                ignoredAttributionPaths: ['CHANGELOG.md'],
                registrySettings: {},
                versioning: { automatic: true }
            } as unknown as BuildAndPublishOptions,
            false
        );

        assert.deepStrictEqual(context, {
            ignoredAttributionPaths: ['CHANGELOG.md'],
            registrySettings: {},
            stage: false,
            targetSourceFiles: []
        });
    });
});
