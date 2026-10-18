import assert from 'node:assert';
import path from 'node:path';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { normalizeAdditionalFile, normalizeRoot } from './normalize-paths.ts';

const pathSegmentArbitrary = fastCheck.stringMatching(/^[\w.-]+$/);

const relativePathArbitrary = fastCheck
    .array(pathSegmentArbitrary, {
        minLength: 1,
        maxLength: 4
    })
    .map(function (segments) {
        return segments.join('/');
    });

const absolutePathArbitrary = fastCheck.tuple(relativePathArbitrary, relativePathArbitrary).map(
    function ([ folder, filePath ]) {
        return path.join(path.sep, folder, filePath);
    }
);

suite('normalize-paths', function () {
    test('normalizeRoot() keeps absolute paths unchanged and resolves relative paths against the source folder', function () {
        fastCheck.assert(
            fastCheck.property(
                relativePathArbitrary,
                relativePathArbitrary,
                fastCheck.option(relativePathArbitrary, { nil: undefined }),
                function (sourceFolder, javaScript, declarationFile) {
                    const relativeRoot = declarationFile === undefined
                        ? { javaScript }
                        : { javaScript, declarationFile };
                    const normalizedRelativeRoot = normalizeRoot(relativeRoot, sourceFolder);

                    assert.strictEqual(normalizedRelativeRoot.javaScript, path.join(sourceFolder, javaScript));
                    if (declarationFile === undefined) {
                        assert.strictEqual(Object.hasOwn(normalizedRelativeRoot, 'declarationFile'), false);
                    } else {
                        assert.strictEqual(
                            normalizedRelativeRoot.declarationFile,
                            path.join(sourceFolder, declarationFile)
                        );
                    }
                }
            )
        );

        fastCheck.assert(
            fastCheck.property(
                absolutePathArbitrary,
                relativePathArbitrary,
                fastCheck.option(absolutePathArbitrary, { nil: undefined }),
                function (javaScript, sourceFolder, declarationFile) {
                    const absoluteRoot = declarationFile === undefined
                        ? { javaScript }
                        : { javaScript, declarationFile };
                    const normalizedAbsoluteRoot = normalizeRoot(absoluteRoot, sourceFolder);

                    assert.strictEqual(normalizedAbsoluteRoot.javaScript, javaScript);
                    if (declarationFile === undefined) {
                        assert.strictEqual(Object.hasOwn(normalizedAbsoluteRoot, 'declarationFile'), false);
                    } else {
                        assert.strictEqual(normalizedAbsoluteRoot.declarationFile, declarationFile);
                    }
                }
            )
        );
    });

    test('normalizeAdditionalFile() keeps the target path and resolves only the source path', function () {
        fastCheck.assert(
            fastCheck.property(
                relativePathArbitrary,
                relativePathArbitrary,
                relativePathArbitrary,
                function (sourceFolder, inputFilePath, targetFilePath) {
                    const normalized = normalizeAdditionalFile({ inputFilePath, targetFilePath }, sourceFolder);

                    assert.deepStrictEqual(normalized, {
                        inputFilePath: path.join(sourceFolder, inputFilePath),
                        targetFilePath
                    });
                }
            )
        );

        fastCheck.assert(
            fastCheck.property(
                relativePathArbitrary,
                absolutePathArbitrary,
                relativePathArbitrary,
                function (sourceFolder, inputFilePath, targetFilePath) {
                    const normalized = normalizeAdditionalFile({ inputFilePath, targetFilePath }, sourceFolder);

                    assert.deepStrictEqual(normalized, {
                        inputFilePath,
                        targetFilePath
                    });
                }
            )
        );
    });

    test('normalizeRoot() is idempotent once all paths are normalized', function () {
        fastCheck.assert(
            fastCheck.property(
                absolutePathArbitrary,
                relativePathArbitrary,
                fastCheck.option(relativePathArbitrary, { nil: undefined }),
                function (sourceFolder, javaScript, declarationFile) {
                    const root = declarationFile === undefined ? { javaScript } : { javaScript, declarationFile };
                    const normalizedOnce = normalizeRoot(root, sourceFolder);
                    const normalizedTwice = normalizeRoot(normalizedOnce, sourceFolder);

                    assert.deepStrictEqual(normalizedTwice, normalizedOnce);
                }
            )
        );
    });

    test('normalizeAdditionalFile() is idempotent once the source path is normalized', function () {
        fastCheck.assert(
            fastCheck.property(
                absolutePathArbitrary,
                relativePathArbitrary,
                relativePathArbitrary,
                function (sourceFolder, inputFilePath, targetFilePath) {
                    const normalizedOnce = normalizeAdditionalFile({ inputFilePath, targetFilePath }, sourceFolder);
                    const normalizedTwice = normalizeAdditionalFile(normalizedOnce, sourceFolder);

                    assert.deepStrictEqual(normalizedTwice, normalizedOnce);
                }
            )
        );
    });
});
