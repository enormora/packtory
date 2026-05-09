import assert from 'node:assert';
import fc from 'fast-check';
import { test } from 'mocha';
import { Maybe } from 'true-myth';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createSourceMapFileLocator } from './source-map-file-locator.ts';

function createLocator(readFileContent: string, isReadable: boolean) {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [{ value: readFileContent }],
        simulatedCheckReadabilityResponses: [{ value: { isReadable } }]
    });
    return createSourceMapFileLocator({ fileManager });
}

test('locate() returns Maybe.nothing() for malformed or missing source-map comments', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.string().filter((value) => {
                return !/^\/\/# sourceMappingURL=(?<url>.+)$/m.test(value);
            }),
            async (fileContent) => {
                const result = await createLocator(fileContent, true).locate('/src/file.js');
                assert.deepStrictEqual(result, Maybe.nothing());
            }
        )
    );
});

test('locate() returns Maybe.nothing() when the referenced source-map file is unreadable', async () => {
    await fc.assert(
        fc.asyncProperty(fc.stringMatching(/^[a-z][\da-z-]{0,7}\.map$/), async (mapFileName) => {
            const result = await createLocator(`//# sourceMappingURL=${mapFileName}`, false).locate('/src/file.js');
            assert.deepStrictEqual(result, Maybe.nothing());
        })
    );
});

test('locate() returns Maybe.just() when the referenced source-map file is readable', async () => {
    await fc.assert(
        fc.asyncProperty(fc.stringMatching(/^[a-z][\da-z-]{0,7}\.map$/), async (mapFileName) => {
            const result = await createLocator(`//# sourceMappingURL=${mapFileName}`, true).locate('/src/file.js');
            assert.deepStrictEqual(result, Maybe.just(`/src/${mapFileName}`));
        })
    );
});
