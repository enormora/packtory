import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import { createSourceMapFileLocator, type SourceMapFileLocator } from './source-map-file-locator.ts';

function createLocator(readFileContent: string, isReadable: boolean): SourceMapFileLocator {
    const fileManager = createFakeFileManager({
        simulatedReadFileResponses: [ { value: readFileContent } ],
        simulatedCheckReadabilityResponses: [ { value: { isReadable } } ]
    });
    return createSourceMapFileLocator({ fileManager });
}

suite('source-map-file-locator', function () {
    test('locate() returns Maybe.nothing() for malformed or missing source-map comments', async function () {
        await fastCheck.assert(
            fastCheck.asyncProperty(
                fastCheck.string().filter(function (value) {
                    return !/^\/\/# sourceMappingURL=.+$/m.test(value);
                }),
                async function (fileContent) {
                    const result = await createLocator(fileContent, true).locate('/source/file.js', '/source');
                    assert.deepStrictEqual(result, Maybe.nothing());
                }
            )
        );
    });

    test('locate() returns Maybe.nothing() when the referenced source-map file is unreadable', async function () {
        await fastCheck.assert(
            fastCheck.asyncProperty(
                fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}\.map$/),
                async function (mapFileName) {
                    const result = await createLocator(`//# sourceMappingURL=${mapFileName}`, false).locate(
                        '/source/file.js',
                        '/source'
                    );
                    assert.deepStrictEqual(result, Maybe.nothing());
                }
            )
        );
    });

    test('locate() returns Maybe.just() when the referenced source-map file is readable', async function () {
        await fastCheck.assert(
            fastCheck.asyncProperty(
                fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}\.map$/),
                async function (mapFileName) {
                    const result = await createLocator(`//# sourceMappingURL=${mapFileName}`, true).locate(
                        '/source/file.js',
                        '/source'
                    );
                    assert.deepStrictEqual(result, Maybe.just(`/source/${mapFileName}`));
                }
            )
        );
    });
});
