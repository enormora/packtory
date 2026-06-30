import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import type { Except } from 'type-fest';
import { packageManifestFilePath } from '../common/package-layout.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import type { LinkedBundle } from './linked-bundle.ts';
import { createGraphFromResolvedBundle, type ResourceGraph } from './resource-graph.ts';
import { substituteDependencies } from './substitute-bundles.ts';

const importCountArbitrary = fc.integer({ min: 0, max: 4 });
type SubstitutionScenario = {
    readonly bundleDependencies: readonly VersionedBundleWithManifest[];
    readonly importPaths: readonly string[];
    readonly selectedFlags: readonly boolean[];
};
type SubstitutionAssertion = {
    readonly importPaths: readonly string[];
    readonly result: Except<LinkedBundle, 'name' | 'roots' | 'surface'>;
    readonly selectedFlags: readonly boolean[];
};

function compareText(left: string, right: string): number {
    return left.localeCompare(right);
}

function createBundleDependency(index: number): VersionedBundleWithManifest {
    const sourceFilePath = `/dep-${index}.js`;

    return {
        roots: {
            main: {
                js: {
                    content: '',
                    isExecutable: false,
                    sourceFilePath,
                    targetFilePath: `dep-${index}.js`
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
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
        exportsField: { '.': { import: `./dep-${index}.js` } },
        mainFile: {
            content: '',
            isExecutable: false,
            sourceFilePath,
            targetFilePath: `dep-${index}.js`
        },
        typesMainFile: undefined,
        packageType: 'module',
        sideEffectsField: undefined,
        manifestFile: { content: '', isExecutable: false, filePath: packageManifestFilePath }
    };
}

function createSubstitutionScenario(importCount: number, replacementFlags: readonly boolean[]): SubstitutionScenario {
    const selectedFlags = replacementFlags.slice(0, importCount);
    const importPaths = Array.from({ length: importCount }, function (_unusedValue, index) {
        return `/dep-${index}.js`;
    });
    const bundleDependencies = importPaths.flatMap(function (_unusedValue, index) {
        return selectedFlags[index] ?? false ? [ createBundleDependency(index) ] : [];
    });

    return { bundleDependencies, importPaths, selectedFlags };
}

function createSubstitutionGraph(importPaths: readonly string[]): ResourceGraph {
    const project = createProject({
        withFiles: [
            {
                filePath: '/entry.js',
                content: importPaths
                    .map(function (filePath) {
                        return `import ".${filePath}";`;
                    })
                    .join('\n')
            },
            ...importPaths.map(function (filePath) {
                return { filePath, content: `export const value = "${filePath}";` };
            })
        ]
    });
    const entryContent = importPaths
        .map(function (filePath) {
            return `import ".${filePath}";`;
        })
        .join('\n');

    return createGraphFromResolvedBundle({
        roots: {
            main: {
                js: {
                    content: '',
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                }
            }
        },
        contents: [
            {
                fileDescription: {
                    content: entryContent,
                    isExecutable: false,
                    sourceFilePath: '/entry.js',
                    targetFilePath: 'entry.js'
                },
                directDependencies: new Set(importPaths),
                project,
                isExplicitlyIncluded: false
            },
            ...importPaths.map(function (filePath) {
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
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        externalDependencies: new Map(),
        name: 'fixture'
    });
}

function assertOutputFilesRemainRelated(outputFiles: readonly string[], importPaths: readonly string[]): void {
    outputFiles.forEach(function (filePath) {
        assert.ok(filePath === '/entry.js' || importPaths.includes(filePath));
    });
}

function assertEntryImportSubstitution(assertion: SubstitutionAssertion): void {
    const entryFile = assertion.result.contents.find(function (entry) {
        return entry.fileDescription.sourceFilePath === '/entry.js';
    });
    if (entryFile === undefined) {
        assert.fail('Expected entry file to exist');
    }

    const outputFiles = new Set(
        assertion
            .result
            .contents
            .map(function (entry) {
                return entry.fileDescription.sourceFilePath;
            })
            .toSorted(compareText)
    );

    assertion.importPaths.forEach(function (filePath, index) {
        const isSubstituted = assertion.selectedFlags[index] ?? false;
        if (isSubstituted) {
            assert.ok(entryFile.fileDescription.content.includes(`package-${index}`));
            assert.strictEqual(outputFiles.has(filePath), false);
        } else {
            assert.ok(entryFile.fileDescription.content.includes(`.${filePath}`));
            assert.strictEqual(outputFiles.has(filePath), true);
        }
    });
}

function assertSubstitutionResult(assertion: SubstitutionAssertion): void {
    const outputFiles = assertion
        .result
        .contents
        .map(function (entry) {
            return entry.fileDescription.sourceFilePath;
        })
        .toSorted(compareText);
    assertOutputFilesRemainRelated(outputFiles, assertion.importPaths);
    assertEntryImportSubstitution(assertion);

    const referencedBundleDependencies = Array.from(assertion.result.linkedBundleDependencies.keys()).toSorted(
        compareText
    );
    const expectedBundleDependencies = assertion
        .importPaths
        .flatMap(function (_unusedValue, index) {
            return assertion.selectedFlags[index] ?? false ? [ `package-${index}` ] : [];
        })
        .toSorted(compareText);
    assert.deepStrictEqual(referencedBundleDependencies, expectedBundleDependencies);
}

suite('substitute-bundles', function () {
    test('substituteDependencies() only rewrites matched imports and never invents unrelated files', function () {
        fc.assert(
            fc.property(
                importCountArbitrary,
                fc.array(fc.boolean(), { minLength: 0, maxLength: 4 }),
                function (importCount, replacementFlags) {
                    const scenario = createSubstitutionScenario(importCount, replacementFlags);
                    const graph = createSubstitutionGraph(scenario.importPaths);
                    const substituted = substituteDependencies(graph, scenario.bundleDependencies);
                    const result = substituted.flatten([ '/entry.js' ]);

                    assertSubstitutionResult({ result, ...scenario });
                }
            ),
            { numRuns: 30 }
        );
    });
});
