import assert from 'node:assert';
import path from 'node:path';
import fc from 'fast-check';
import { test } from 'mocha';
import { normalizeAdditionalFile, normalizeRoot } from './normalize-paths.ts';

const pathSegmentArbitrary = fc.stringMatching(/^[\w.-]+$/);

const relativePathArbitrary = fc
    .array(pathSegmentArbitrary, {
        minLength: 1,
        maxLength: 4
    })
    .map((segments) => {
        return segments.join('/');
    });

const absolutePathArbitrary = fc.tuple(relativePathArbitrary, relativePathArbitrary).map(([folder, filePath]) => {
    return path.join(path.sep, folder, filePath);
});

test('normalizeRoot() keeps absolute paths unchanged and resolves relative paths against the source folder', () => {
    fc.assert(
        fc.property(
            relativePathArbitrary,
            relativePathArbitrary,
            fc.option(relativePathArbitrary, { nil: undefined }),
            (sourceFolder, js, declarationFile) => {
                const relativeEntryPoint = declarationFile === undefined ? { js } : { js, declarationFile };
                const normalizedRelativeEntryPoint = normalizeRoot(relativeEntryPoint, sourceFolder);

                assert.strictEqual(normalizedRelativeEntryPoint.js, path.join(sourceFolder, js));
                assert.strictEqual(
                    normalizedRelativeEntryPoint.declarationFile,
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
            (js, sourceFolder, declarationFile) => {
                const absoluteEntryPoint = declarationFile === undefined ? { js } : { js, declarationFile };
                const normalizedAbsoluteEntryPoint = normalizeRoot(absoluteEntryPoint, sourceFolder);

                assert.strictEqual(normalizedAbsoluteEntryPoint.js, js);
                assert.strictEqual(normalizedAbsoluteEntryPoint.declarationFile, declarationFile);
            }
        )
    );
});

test('normalizeAdditionalFile() keeps the target path and resolves only the source path', () => {
    fc.assert(
        fc.property(
            relativePathArbitrary,
            relativePathArbitrary,
            relativePathArbitrary,
            (sourceFolder, sourceFilePath, targetFilePath) => {
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
            (sourceFolder, sourceFilePath, targetFilePath) => {
                const normalized = normalizeAdditionalFile({ sourceFilePath, targetFilePath }, sourceFolder);

                assert.deepStrictEqual(normalized, {
                    sourceFilePath,
                    targetFilePath
                });
            }
        )
    );
});

test('normalizeRoot() is idempotent once all paths are normalized', () => {
    fc.assert(
        fc.property(
            absolutePathArbitrary,
            relativePathArbitrary,
            fc.option(relativePathArbitrary, { nil: undefined }),
            (sourceFolder, js, declarationFile) => {
                const entryPoint = declarationFile === undefined ? { js } : { js, declarationFile };
                const normalizedOnce = normalizeRoot(entryPoint, sourceFolder);
                const normalizedTwice = normalizeRoot(normalizedOnce, sourceFolder);

                assert.deepStrictEqual(normalizedTwice, normalizedOnce);
            }
        )
    );
});

test('normalizeAdditionalFile() is idempotent once the source path is normalized', () => {
    fc.assert(
        fc.property(
            absolutePathArbitrary,
            relativePathArbitrary,
            relativePathArbitrary,
            (sourceFolder, sourceFilePath, targetFilePath) => {
                const normalizedOnce = normalizeAdditionalFile({ sourceFilePath, targetFilePath }, sourceFolder);
                const normalizedTwice = normalizeAdditionalFile(normalizedOnce, sourceFolder);

                assert.deepStrictEqual(normalizedTwice, normalizedOnce);
            }
        )
    );
});
