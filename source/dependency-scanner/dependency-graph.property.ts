import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { unique } from 'remeda';
import { Maybe } from 'true-myth';
import {
    createDependencyGraph,
    mergeDependencyFiles,
    type DependencyFiles,
    type LocalFile
} from './dependency-graph.ts';

const filePathArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,7}\.js$/);

function filePathAt(filePaths: readonly string[], index: number): string {
    const filePath = filePaths[index];
    if (filePath === undefined) {
        throw new Error(`Missing generated file path at index ${index}`);
    }
    return filePath;
}

const dependencyFilesArbitrary: fc.Arbitrary<DependencyFiles> = fc
    .uniqueArray(filePathArbitrary, {
        minLength: 1,
        maxLength: 3
    })
    .chain(function (filePaths) {
        const fileIndexes = Array.from(filePaths.keys());
        const possibleConnections = fileIndexes.flatMap(function (fromIndex) {
            return fileIndexes.flatMap(function (toIndex) {
                if (fromIndex < toIndex) {
                    return [ [ fromIndex, toIndex ] as const ];
                }

                return [];
            });
        });

        return fc
            .record({
                sourceMapFlags: fc.array(fc.boolean(), { minLength: filePaths.length, maxLength: filePaths.length }),
                externalDependencyNames: fc.array(fc.stringMatching(/^[a-z][\da-z-]{0,7}$/), { maxLength: 3 }),
                connections: fc.shuffledSubarray(possibleConnections)
            })
            .map(function (options) {
                const graph = createDependencyGraph();
                const projectObject = {};

                filePaths.forEach(function (filePath, index) {
                    graph.addDependency(filePath, {
                        sourceMapFilePath: options.sourceMapFlags[index] === true
                            ? Maybe.just(`${filePath}.map`)
                            : Maybe.nothing(),
                        externalDependencies: options.externalDependencyNames.flatMap(function (
                            dependencyName,
                            dependencyIndex
                        ) {
                            return dependencyIndex % filePaths.length === index % filePaths.length
                                ? [ dependencyName ]
                                : [];
                        }),
                        project: {
                            getProject() {
                                return projectObject;
                            }
                        }
                    } as never);
                });

                options.connections.forEach(function ([ fromIndex, toIndex ]) {
                    graph.connect(filePathAt(filePaths, fromIndex), filePathAt(filePaths, toIndex));
                });

                return graph.flatten(filePathAt(filePaths, 0));
            });
    });

const localFilesArbitrary: fc.Arbitrary<readonly LocalFile[]> = fc
    .uniqueArray(filePathArbitrary, {
        minLength: 1,
        maxLength: 3
    })
    .map(function (filePaths) {
        return filePaths.map(function (filePath) {
            const localFile: LocalFile = {
                filePath,
                directDependencies: new Set<string>()
            };
            return localFile;
        });
    });

suite('dependency-graph', function () {
    test('flatten() only references known file paths or generated source-map files', function () {
        fc.assert(
            fc.property(dependencyFilesArbitrary, function (dependencyFiles) {
                const filePaths = new Set(
                    dependencyFiles.localFiles.map(function (file) {
                        return file.filePath;
                    })
                );

                for (const file of dependencyFiles.localFiles) {
                    for (const dependency of file.directDependencies) {
                        assert.ok(filePaths.has(dependency) || dependency.endsWith('.js.map'));
                    }
                }

                for (const dependency of dependencyFiles.externalDependencies.values()) {
                    for (const reference of dependency.referencedFrom) {
                        assert.ok(filePaths.has(reference));
                    }
                }
            }),
            { numRuns: 5 }
        );
    });

    test('mergeDependencyFiles() preserves uniqueness by file path', function () {
        fc.assert(
            fc.property(localFilesArbitrary, localFilesArbitrary, function (firstLocalFiles, secondLocalFiles) {
                const first: DependencyFiles = {
                    localFiles: firstLocalFiles,
                    externalDependencies: new Map()
                };
                const second: DependencyFiles = {
                    localFiles: secondLocalFiles,
                    externalDependencies: new Map()
                };

                const merged = mergeDependencyFiles(first, second);
                const mergedPaths = merged.localFiles.map(function (file) {
                    return file.filePath;
                });

                assert.deepStrictEqual(mergedPaths, unique(mergedPaths));
            }),
            { numRuns: 5 }
        );
    });
});
