import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { unique } from 'remeda';
import { Maybe } from 'true-myth';
import {
    createDependencyGraph,
    mergeDependencyFiles,
    type DependencyFiles,
    type LocalFile
} from './dependency-graph.ts';

const filePathArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}\.js$/);

function filePathAt(filePaths: readonly string[], index: number): string {
    const filePath = filePaths[index];
    if (filePath === undefined) {
        throw new Error(`Missing generated file path at index ${index}`);
    }
    return filePath;
}

const dependencyFilesArbitrary: fastCheck.Arbitrary<DependencyFiles> = fastCheck
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

        return fastCheck
            .record({
                sourceMapFlags: fastCheck.array(fastCheck.boolean(), {
                    minLength: filePaths.length,
                    maxLength: filePaths.length
                }),
                externalDependencyNames: fastCheck.array(fastCheck.stringMatching(/^[a-z][\da-z-]{0,7}$/), {
                    maxLength: 3
                }),
                connections: fastCheck.shuffledSubarray(possibleConnections)
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
                        moduleReferences: [],
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

const localFilesArbitrary: fastCheck.Arbitrary<readonly LocalFile[]> = fastCheck
    .uniqueArray(filePathArbitrary, {
        minLength: 1,
        maxLength: 3
    })
    .map(function (filePaths) {
        return filePaths.map(function (filePath) {
            const localFile: LocalFile = {
                filePath,
                directDependencies: new Set<string>(),
                moduleReferences: []
            };
            return localFile;
        });
    });

suite('dependency-graph', function () {
    test('flatten() only references known file paths or generated source-map files', function () {
        fastCheck.assert(
            fastCheck.property(dependencyFilesArbitrary, function (dependencyFiles) {
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
        fastCheck.assert(
            fastCheck.property(localFilesArbitrary, localFilesArbitrary, function (firstLocalFiles, secondLocalFiles) {
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
