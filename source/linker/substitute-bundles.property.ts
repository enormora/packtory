import assert from 'node:assert';
import fc from 'fast-check';
import { test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createGraphFromResolvedBundle } from './resource-graph.ts';
import { substituteDependencies } from './substitute-bundles.ts';

const importCountArbitrary = fc.integer({ min: 0, max: 4 });

function createBundleDependency(index: number): VersionedBundleWithManifest {
    const sourceFilePath = `/dep-${index}.js`;

    return {
        contents: [
            {
                fileDescription: {
                    content: '',
                    isExecutable: false,
                    sourceFilePath,
                    targetFilePath: `dep-${index}.js`
                },
                directDependencies: new Set(),
                isSubstituted: false,
                isExplicitlyIncluded: false,
                analysis: {
                    survivingBindings: new Set<string>(),
                    sideEffectStatements: [],
                    sideEffectImports: new Set<string>()
                }
            }
        ],
        packageJson: { name: `package-${index}`, version: '1.0.0' },
        name: `package-${index}`,
        version: '1.0.0',
        dependencies: {},
        peerDependencies: {},
        additionalAttributes: {},
        mainFile: {
            content: '',
            isExecutable: false,
            sourceFilePath,
            targetFilePath: `dep-${index}.js`
        },
        typesMainFile: undefined,
        packageType: 'module',
        sideEffectsField: undefined,
        manifestFile: { content: '', isExecutable: false, filePath: 'package.json' }
    };
}

test('substituteDependencies() only rewrites matched imports and never invents unrelated files', () => {
    fc.assert(
        fc.property(
            importCountArbitrary,
            fc.array(fc.boolean(), { minLength: 0, maxLength: 4 }),
            (importCount, replacementFlags) => {
                const selectedFlags = replacementFlags.slice(0, importCount);
                const importPaths = Array.from({ length: importCount }, (_, index) => {
                    return `/dep-${index}.js`;
                });
                const project = createProject({
                    withFiles: [
                        {
                            filePath: '/entry.js',
                            content: importPaths
                                .map((filePath) => {
                                    return `import ".${filePath}";`;
                                })
                                .join('\n')
                        },
                        ...importPaths.map((filePath) => {
                            return { filePath, content: `export const value = "${filePath}";` };
                        })
                    ]
                });

                const graph = createGraphFromResolvedBundle({
                    contents: [
                        {
                            fileDescription: {
                                content: importPaths
                                    .map((filePath) => {
                                        return `import ".${filePath}";`;
                                    })
                                    .join('\n'),
                                isExecutable: false,
                                sourceFilePath: '/entry.js',
                                targetFilePath: 'entry.js'
                            },
                            directDependencies: new Set(importPaths),
                            project,
                            isExplicitlyIncluded: false
                        },
                        ...importPaths.map((filePath) => {
                            return {
                                fileDescription: {
                                    content: `export const value = "${filePath}";`,
                                    isExecutable: false,
                                    sourceFilePath: filePath,
                                    targetFilePath: filePath.slice(1)
                                },
                                directDependencies: new Set<string>(),
                                project,
                                isExplicitlyIncluded: false
                            };
                        })
                    ],
                    entryPoints: [
                        {
                            js: {
                                content: '',
                                isExecutable: false,
                                sourceFilePath: '/entry.js',
                                targetFilePath: 'entry.js'
                            }
                        }
                    ],
                    externalDependencies: new Map(),
                    name: 'fixture'
                });

                const bundleDependencies = importPaths.flatMap((_, index) => {
                    return (selectedFlags[index] ?? false) ? [createBundleDependency(index)] : [];
                });

                const substituted = substituteDependencies(graph, bundleDependencies);
                const result = substituted.flatten(['/entry.js']);
                const outputFiles = result.contents
                    .map((entry) => {
                        return entry.fileDescription.sourceFilePath;
                    })
                    .toSorted();

                outputFiles.forEach((filePath) => {
                    assert.ok(filePath === '/entry.js' || importPaths.includes(filePath));
                });

                const entryFile = result.contents.find((entry) => {
                    return entry.fileDescription.sourceFilePath === '/entry.js';
                });
                if (entryFile === undefined) {
                    assert.fail('Expected entry file to exist');
                }

                importPaths.forEach((filePath, index) => {
                    const isSubstituted = selectedFlags[index] ?? false;
                    if (isSubstituted) {
                        assert.ok(entryFile.fileDescription.content.includes(`package-${index}/dep-${index}.js`));
                        assert.strictEqual(outputFiles.includes(filePath), false);
                    } else {
                        assert.ok(entryFile.fileDescription.content.includes(`.${filePath}`));
                        assert.strictEqual(outputFiles.includes(filePath), true);
                    }
                });

                const referencedBundleDependencies = Array.from(result.linkedBundleDependencies.keys()).toSorted();
                const expectedBundleDependencies = importPaths
                    .flatMap((_, index) => {
                        return (selectedFlags[index] ?? false) ? [`package-${index}`] : [];
                    })
                    .toSorted();
                assert.deepStrictEqual(referencedBundleDependencies, expectedBundleDependencies);
            }
        ),
        { numRuns: 30 }
    );
});
