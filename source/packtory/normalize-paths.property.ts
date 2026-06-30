import assert from 'node:assert';
import path from 'node:path';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { normalizeAdditionalFile, normalizeRoot } from './normalize-paths.ts';

const pathSegmentArbitrary = fc.stringMatching(/^[\w.-]+$/);

const relativePathArbitrary = fc
    .array(pathSegmentArbitrary, {
        minLength: 1,
        maxLength: 4
    })
    .map(function (segments) {
        return segments.join('/');
    });

const absolutePathArbitrary = fc.tuple(relativePathArbitrary, relativePathArbitrary).map(
    function ([ folder, filePath ]) {
        return path.join(path.sep, folder, filePath);
    }
);

suite('normalize-paths', function () {
    test('normalizeRoot() keeps absolute paths unchanged and resolves relative paths against the source folder', function () {
        fc.assert(
            fc.property(
                relativePathArbitrary,
                relativePathArbitrary,
                fc.option(relativePathArbitrary, { nil: undefined }),
                function (sourceFolder, js, declarationFile) {
                    const relativeRoot = declarationFile === undefined ? { js } : { js, declarationFile };
                    const normalizedRelativeRoot = normalizeRoot(relativeRoot, sourceFolder);

                    assert.strictEqual(normalizedRelativeRoot.js, path.join(sourceFolder, js));
                    assert.strictEqual(
                        normalizedRelativeRoot.declarationFile,
                        declarationFile === undefined ? undefined : path.join(sourceFolder, declarationFile)
                    );
                }
            )
        );

        fc.assert(
            fc.property(
                absolutePathArbitrary,
                relativePathArbitrary,
                fc.option(absolutePathArbitrary, { nil: undefined }),
                function (js, sourceFolder, declarationFile) {
                    const absoluteRoot = declarationFile === undefined ? { js } : { js, declarationFile };
                    const normalizedAbsoluteRoot = normalizeRoot(absoluteRoot, sourceFolder);

                    assert.strictEqual(normalizedAbsoluteRoot.js, js);
                    assert.strictEqual(normalizedAbsoluteRoot.declarationFile, declarationFile);
                }
            )
        );
    });

    test('normalizeAdditionalFile() keeps the target path and resolves only the source path', function () {
        fc.assert(
            fc.property(
                relativePathArbitrary,
                relativePathArbitrary,
                relativePathArbitrary,
                function (sourceFolder, sourceFilePath, targetFilePath) {
                    const normalized = normalizeAdditionalFile({ sourceFilePath, targetFilePath }, sourceFolder);

                    assert.deepStrictEqual(normalized, {
                        sourceFilePath: path.join(sourceFolder, sourceFilePath),
                        targetFilePath
                    });
                }
            )
        );

        fc.assert(
            fc.property(
                relativePathArbitrary,
                absolutePathArbitrary,
                relativePathArbitrary,
                function (sourceFolder, sourceFilePath, targetFilePath) {
                    const normalized = normalizeAdditionalFile({ sourceFilePath, targetFilePath }, sourceFolder);

                    assert.deepStrictEqual(normalized, {
                        sourceFilePath,
                        targetFilePath
                    });
                }
            )
        );
    });

    test('normalizeRoot() is idempotent once all paths are normalized', function () {
        fc.assert(
            fc.property(
                absolutePathArbitrary,
                relativePathArbitrary,
                fc.option(relativePathArbitrary, { nil: undefined }),
                function (sourceFolder, js, declarationFile) {
                    const root = declarationFile === undefined ? { js } : { js, declarationFile };
                    const normalizedOnce = normalizeRoot(root, sourceFolder);
                    const normalizedTwice = normalizeRoot(normalizedOnce, sourceFolder);

                    assert.deepStrictEqual(normalizedTwice, normalizedOnce);
                }
            )
        );
    });

    test('normalizeAdditionalFile() is idempotent once the source path is normalized', function () {
        fc.assert(
            fc.property(
                absolutePathArbitrary,
                relativePathArbitrary,
                relativePathArbitrary,
                function (sourceFolder, sourceFilePath, targetFilePath) {
                    const normalizedOnce = normalizeAdditionalFile({ sourceFilePath, targetFilePath }, sourceFolder);
                    const normalizedTwice = normalizeAdditionalFile(normalizedOnce, sourceFolder);

                    assert.deepStrictEqual(normalizedTwice, normalizedOnce);
                }
            )
        );
    });
});
