import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import { createBundleLinker, type BundleLinker } from './linker.ts';

type LinkedBundleResult = Awaited<ReturnType<BundleLinker['linkBundle']>>;
type LinkBundleOptions = Parameters<BundleLinker['linkBundle']>[0];
type BundleSubstitutionSource = LinkBundleOptions['bundleDependencies'][number];

function compareText(left: string, right: string): number {
    return left.localeCompare(right);
}

function testFileDescription(
    sourceFilePath: string,
    targetFilePath: string,
    content: string
): ResolvedBundle['contents'][number]['fileDescription'] {
    return {
        content,
        isExecutable: false,
        sourceFilePath,
        targetFilePath
    };
}

function sourceTargetFilePath(sourceFilePath: string): string {
    return sourceFilePath.replace(/^\/src\//u, '');
}

function testSubstitutionResource(sourceFilePath: string): BundleSubstitutionSource['contents'][number] {
    const targetFilePath = sourceTargetFilePath(sourceFilePath);
    return {
        fileDescription: testFileDescription(sourceFilePath, targetFilePath, ''),
        directDependencies: new Set(),
        isSubstituted: false,
        isExplicitlyIncluded: false
    };
}

function testBundleDependency(
    sourceFilePaths: readonly [string, ...(readonly string[])]
): BundleSubstitutionSource {
    const rootSourceFilePath = sourceFilePaths[0];
    const rootTargetFilePath = sourceTargetFilePath(rootSourceFilePath);
    return {
        name: 'bundle-dependency',
        roots: {
            main: {
                js: testFileDescription(rootSourceFilePath, rootTargetFilePath, '')
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        contents: sourceFilePaths.map(testSubstitutionResource)
    };
}

function testResource(
    sourceFilePath: string,
    targetFilePath: string,
    content: string,
    directDependencies: readonly string[]
): ResolvedBundle['contents'][number] {
    return {
        fileDescription: testFileDescription(sourceFilePath, targetFilePath, content),
        directDependencies: new Set(directDependencies),
        isExplicitlyIncluded: false
    };
}

function testRootWithDeclaration(): ResolvedBundle['roots'][string] {
    return {
        js: testFileDescription('/src/index.js', 'index.js', ''),
        declarationFile: testFileDescription('/src/index.d.ts', 'index.d.ts', '')
    };
}

async function linkTestBundle(
    root: ResolvedBundle['roots'][string],
    contents: ResolvedBundle['contents']
): Promise<LinkedBundleResult> {
    const linker = createBundleLinker();
    return await linker.linkBundle({
        bundle: {
            name: 'package-a',
            contents,
            roots: { main: root },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' },
            externalDependencies: new Map()
        },
        bundleDependencies: [],
        bundlePeerDependencies: []
    });
}

function sourceFilePathsOf(
    contents: LinkedBundleResult['contents']
): readonly string[] {
    return contents.map(function (content) {
        return content.fileDescription.sourceFilePath;
    });
}

suite('linker', function () {
    test('linkBundle() keeps js-only roots when there are no bundle substitutions', async function () {
        const linker = createBundleLinker();
        const root = {
            js: {
                content: '',
                isExecutable: false,
                sourceFilePath: '/src/index.js',
                targetFilePath: 'index.js'
            }
        } as const;

        const result = await linker.linkBundle({
            bundle: {
                name: 'package-a',
                exportPackageJson: true,
                contents: [
                    {
                        fileDescription: {
                            content: 'import "./internal.js";',
                            isExecutable: false,
                            sourceFilePath: '/src/index.js',
                            targetFilePath: 'index.js'
                        },
                        directDependencies: new Set([ '/src/internal.js' ]),
                        isExplicitlyIncluded: false,
                        project: createProject({
                            withFiles: [
                                { filePath: '/src/index.js', content: 'import "./internal.js";' },
                                { filePath: '/src/internal.js', content: 'export {};' }
                            ]
                        })
                    },
                    {
                        fileDescription: {
                            content: 'export {};',
                            isExecutable: false,
                            sourceFilePath: '/src/internal.js',
                            targetFilePath: 'internal.js'
                        },
                        directDependencies: new Set(),
                        isExplicitlyIncluded: false
                    }
                ],
                roots: { main: root },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                externalDependencies: new Map()
            },
            bundleDependencies: [],
            bundlePeerDependencies: []
        });

        assertDeepSubset(result, {
            name: 'package-a',
            exportPackageJson: true,
            roots: {
                main: {
                    js: {
                        content: '',
                        isExecutable: false,
                        sourceFilePath: '/src/index.js',
                        targetFilePath: 'index.js'
                    }
                }
            },
            contents: {
                length: 2
            }
        });
    });

    test('linkBundle() flattens declaration roots and substitutes matching bundle dependencies', async function () {
        const project = createProject({
            withFiles: [
                { filePath: '/src/index.js', content: 'import "./dep.js";' },
                { filePath: '/src/index.d.ts', content: 'export * from "./dep.d.ts";' }
            ]
        });
        const linker = createBundleLinker();
        const root = {
            js: {
                content: '',
                isExecutable: false,
                sourceFilePath: '/src/index.js',
                targetFilePath: 'index.js'
            },
            declarationFile: {
                content: '',
                isExecutable: false,
                sourceFilePath: '/src/index.d.ts',
                targetFilePath: 'index.d.ts'
            }
        } as const;

        const result = await linker.linkBundle({
            bundle: {
                name: 'package-a',
                contents: [
                    {
                        fileDescription: {
                            content: 'import "./dep.js";',
                            isExecutable: false,
                            sourceFilePath: '/src/index.js',
                            targetFilePath: 'index.js'
                        },
                        directDependencies: new Set([ '/src/dep.js' ]),
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'export * from "./dep.d.ts";',
                            isExecutable: false,
                            sourceFilePath: '/src/index.d.ts',
                            targetFilePath: 'index.d.ts'
                        },
                        directDependencies: new Set([ '/src/dep.d.ts' ]),
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'export const dep = 1;',
                            isExecutable: false,
                            sourceFilePath: '/src/dep.js',
                            targetFilePath: 'dep.js'
                        },
                        directDependencies: new Set(),
                        isExplicitlyIncluded: false
                    },
                    {
                        fileDescription: {
                            content: 'export declare const dep: number;',
                            isExecutable: false,
                            sourceFilePath: '/src/dep.d.ts',
                            targetFilePath: 'dep.d.ts'
                        },
                        directDependencies: new Set(),
                        isExplicitlyIncluded: false
                    }
                ],
                roots: { main: root },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                externalDependencies: new Map()
            },
            bundleDependencies: [ testBundleDependency([ '/src/dep.js', '/src/dep.d.ts' ]) ],
            bundlePeerDependencies: []
        });

        assert.strictEqual(result.contents.length, 2);
        assert.strictEqual(result.contents[0]?.isSubstituted, true);
        assert.deepStrictEqual(Array.from(result.linkedBundleDependencies.keys()), [ 'bundle-dependency' ]);
        assert.deepStrictEqual(
            result.substitutedSourceFilePathsByPackageName,
            new Map([
                [ 'bundle-dependency', new Set([ '/src/dep.js', '/src/dep.d.ts' ]) ]
            ])
        );
    });

    test('linkBundle() excludes local declaration companions for substituted dependency sources', async function () {
        const project = createProject({
            withFiles: [
                { filePath: '/src/index.js', content: 'import "./dep.js";' },
                { filePath: '/src/dep.js', content: 'export const dep = 1;' },
                { filePath: '/src/dep.d.ts', content: 'export declare const dep: number;' }
            ]
        });
        const linker = createBundleLinker();
        const root = {
            js: testFileDescription('/src/index.js', 'index.js', '')
        };

        const result = await linker.linkBundle({
            bundle: {
                name: 'package-a',
                contents: [
                    {
                        ...testResource('/src/index.js', 'index.js', 'import "./dep.js";', [ '/src/dep.js' ]),
                        project
                    },
                    testResource('/src/dep.js', 'dep.js', 'export const dep = 1;', []),
                    testResource('/src/dep.d.ts', 'dep.d.ts', 'export declare const dep: number;', [])
                ],
                roots: { main: root },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                externalDependencies: new Map()
            },
            bundleDependencies: [ testBundleDependency([ '/src/dep.js' ]) ],
            bundlePeerDependencies: []
        });

        assert.deepStrictEqual(sourceFilePathsOf(result.contents), [ '/src/index.js' ]);
        assert.deepStrictEqual(Array.from(result.linkedBundleDependencies.keys()), [ 'bundle-dependency' ]);
    });

    test('linkBundle() keeps declaration companions for non-root js files', async function () {
        const root = testRootWithDeclaration();
        const result = await linkTestBundle(root, [
            testResource('/src/index.js', 'index.js', 'import "./public.js";', [ '/src/public.js' ]),
            testResource('/src/index.d.ts', 'index.d.ts', 'export declare const root: string;', []),
            testResource('/src/public.js', 'public.js', 'export const publicValue = "value";', []),
            testResource('/src/public.d.ts', 'public.d.ts', 'export declare const publicValue: string;', [])
        ]);

        assert.deepStrictEqual(
            sourceFilePathsOf(result.contents),
            [ '/src/index.js', '/src/public.js', '/src/index.d.ts', '/src/public.d.ts' ]
        );
    });

    test('linkBundle() keeps declaration roots that are not js companions', async function () {
        const root = {
            js: testFileDescription('/src/index.js', 'index.js', ''),
            declarationFile: testFileDescription('/src/types/root.d.ts', 'types/root.d.ts', '')
        };
        const result = await linkTestBundle(root, [
            testResource('/src/index.js', 'index.js', 'export {};', []),
            testResource('/src/types/root.d.ts', 'types/root.d.ts', 'export {};', [])
        ]);

        assert.deepStrictEqual(
            sourceFilePathsOf(result.contents),
            [ '/src/index.js', '/src/types/root.d.ts' ]
        );
    });

    test('linkBundle() tolerates explicit roots that share transitive files', async function () {
        const project = createProject({
            withFiles: [
                { filePath: '/src/cli.js', content: 'import "./shared.js";' },
                { filePath: '/src/worker.js', content: 'import "./shared.js";' },
                { filePath: '/src/shared.js', content: 'export const shared = 1;' }
            ]
        });
        const linker = createBundleLinker();

        const result = await linker.linkBundle({
            bundle: {
                name: '@packtory/cli',
                contents: [
                    {
                        fileDescription: {
                            content: 'import "./shared.js";',
                            isExecutable: true,
                            sourceFilePath: '/src/cli.js',
                            targetFilePath: 'cli.js'
                        },
                        directDependencies: new Set([ '/src/shared.js' ]),
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'import "./shared.js";',
                            isExecutable: false,
                            sourceFilePath: '/src/worker.js',
                            targetFilePath: 'worker.js'
                        },
                        directDependencies: new Set([ '/src/shared.js' ]),
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'export const shared = 1;',
                            isExecutable: false,
                            sourceFilePath: '/src/shared.js',
                            targetFilePath: 'shared.js'
                        },
                        directDependencies: new Set(),
                        isExplicitlyIncluded: false,
                        project
                    }
                ],
                roots: {
                    cli: {
                        js: {
                            content: '#!/usr/bin/env node\nimport "./shared.js";',
                            isExecutable: true,
                            sourceFilePath: '/src/cli.js',
                            targetFilePath: 'cli.js'
                        }
                    },
                    worker: {
                        js: {
                            content: 'import "./shared.js";',
                            isExecutable: false,
                            sourceFilePath: '/src/worker.js',
                            targetFilePath: 'worker.js'
                        }
                    }
                },
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        bins: [ { root: 'cli', name: 'packtory' } ],
                        privateRoots: [ 'worker' ]
                    }
                },
                externalDependencies: new Map()
            },
            bundleDependencies: [],
            bundlePeerDependencies: []
        });

        assert.strictEqual(result.contents.length, 3);
        assert.deepStrictEqual(
            result
                .contents
                .map(function (entry) {
                    return entry.fileDescription.sourceFilePath;
                })
                .toSorted(compareText),
            [ '/src/cli.js', '/src/worker.js', '/src/shared.js' ].toSorted(compareText)
        );
    });
});
