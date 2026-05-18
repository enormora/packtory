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

const dependencyFilesArbitrary: fc.Arbitrary<DependencyFiles> = fc
    .uniqueArray(filePathArbitrary, {
        minLength: 1,
        maxLength: 3
    })
    .chain((filePaths) => {
        const possibleConnections = filePaths.flatMap((_, fromIndex) => {
            return filePaths.flatMap((__, toIndex) => {
                if (fromIndex < toIndex) {
                    return [[fromIndex, toIndex] as const];
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
            .map((options) => {
                const graph = createDependencyGraph();
                const projectObject = {};

                filePaths.forEach((filePath, index) => {
                    graph.addDependency(filePath, {
                        sourceMapFilePath: options.sourceMapFlags[index]
                            ? Maybe.just(`${filePath}.map`)
                            : Maybe.nothing(),
                        externalDependencies: options.externalDependencyNames.filter((_, dependencyIndex) => {
                            return dependencyIndex % filePaths.length === index % filePaths.length;
                        }),
                        project: {
                            getProject() {
                                return projectObject;
                            }
                        }
                    } as never);
                });

                options.connections.forEach(([fromIndex, toIndex]) => {
                    graph.connect(filePaths[fromIndex]!, filePaths[toIndex]!);
                });

                return graph.flatten(filePaths[0]!);
            });
    });

const localFilesArbitrary: fc.Arbitrary<readonly LocalFile[]> = fc
    .uniqueArray(filePathArbitrary, {
        minLength: 1,
        maxLength: 3
    })
    .map((filePaths) => {
        return filePaths.map((filePath) => {
            return {
                filePath,
                directDependencies: new Set<string>()
            } satisfies LocalFile;
        });
    });

suite('dependency-graph', function () {
    test('flatten() only references known file paths or generated source-map files', function () {
        fc.assert(
            fc.property(dependencyFilesArbitrary, (dependencyFiles) => {
                const filePaths = new Set(
                    dependencyFiles.localFiles.map((file) => {
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
            fc.property(localFilesArbitrary, localFilesArbitrary, (firstLocalFiles, secondLocalFiles) => {
                const first: DependencyFiles = {
                    localFiles: firstLocalFiles,
                    externalDependencies: new Map()
                };
                const second: DependencyFiles = {
                    localFiles: secondLocalFiles,
                    externalDependencies: new Map()
                };

                const merged = mergeDependencyFiles(first, second);
                const mergedPaths = merged.localFiles.map((file) => {
                    return file.filePath;
                });

                assert.deepStrictEqual(mergedPaths, unique(mergedPaths));
            }),
            { numRuns: 5 }
        );
    });
});
