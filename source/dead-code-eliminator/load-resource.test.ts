import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { loadResource } from './load-resource.ts';

suite('resource preparation boundaries', function () {
    for (
        const [ targetFilePath, transformationsEnabled ] of [ [ 'index.ts', false ], [ 'index.d.ts', true ] ] as const
    ) {
        test(`preserves ${targetFilePath} when transformations are ${String(transformationsEnabled)}`, function () {
            const content = 'export const value=1+2;';
            const resource = {
                ...bundleResource(`/source/${targetFilePath}`, { targetFilePath, content }),
                isSubstituted: false
            };
            const loaded = loadResource(createProject(), createProject(), resource, transformationsEnabled);
            assertDefined(loaded.sourceFile);
            assert.strictEqual(loaded.sourceFile.getFullText(), content);
            assert.deepStrictEqual(loaded.transformations, []);
        });
    }
});
