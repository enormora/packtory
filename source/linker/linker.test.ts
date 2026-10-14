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
    inputFilePath: string,
    targetFilePath: string,
    content: string
): ResolvedBundle['contents'][number]['fileDescription'] {
    return {
        content,
        isExecutable: false,
        inputFilePath,
        targetFilePath
    };
}

function sourceTargetFilePath(inputFilePath: string): string {
    return inputFilePath.replace(/^\/source\//u, '');
}

function testSubstitutionResource(inputFilePath: string): BundleSubstitutionSource['contents'][number] {
    const targetFilePath = sourceTargetFilePath(inputFilePath);
    return {
        fileDescription: testFileDescription(inputFilePath, targetFilePath, ''),
        directDependencies: new Set()
    };
}

function testBundleDependency(
    inputFilePaths: readonly [string, ...(readonly string[])]
): BundleSubstitutionSource {
    const rootInputFilePath = inputFilePaths[0];
    const rootTargetFilePath = sourceTargetFilePath(rootInputFilePath);
    return {
        name: 'bundle-dependency',
        roots: {
            main: {
                javaScript: testFileDescription(rootInputFilePath, rootTargetFilePath, ''),
                declarationFile: inputFilePaths.includes('/source/dep.d.ts')
                    ? testFileDescription('/source/dep.d.ts', 'dep.d.ts', '')
                    : undefined
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        contents: inputFilePaths.map(testSubstitutionResource)
    };
}

function testResource(
    inputFilePath: string,
    targetFilePath: string,
    content: string,
    directDependencies: readonly string[]
): ResolvedBundle['contents'][number] {
    return {
        fileDescription: testFileDescription(inputFilePath, targetFilePath, content),
        directDependencies: new Set(directDependencies.map(sourceTargetFilePath)),
        moduleReferences: [],
        isExplicitlyIncluded: false
    };
}

function testRootWithDeclaration(): ResolvedBundle['roots'][string] {
    return {
        javaScript: testFileDescription('/source/index.js', 'index.js', ''),
        declarationFile: testFileDescription('/source/index.d.ts', 'index.d.ts', '')
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

function inputFilePathsOf(
    contents: LinkedBundleResult['contents']
): readonly string[] {
    return contents.map(function (content) {
        return content.fileDescription.inputFilePath;
    });
}

suite('linker', function () {
    test('linkBundle() keeps js-only roots when there are no bundle substitutions', async function () {
        const linker = createBundleLinker();
        const root = {
            javaScript: {
                content: '',
                isExecutable: false,
                inputFilePath: '/source/index.js',
                targetFilePath: 'index.js'
            }
        } as const;

        const result = await linker.linkBundle({
            bundle: {
                name: 'package-a',
                exportPackageManifest: true,
                contents: [
                    {
                        fileDescription: {
                            content: 'import "./internal.js";',
                            isExecutable: false,
                            inputFilePath: '/source/index.js',
                            targetFilePath: 'index.js'
                        },
                        directDependencies: new Set([ 'internal.js' ]),
                        moduleReferences: [],
                        isExplicitlyIncluded: false,
                        project: createProject({
                            withFiles: [
                                { filePath: '/source/index.js', content: 'import "./internal.js";' },
                                { filePath: '/source/internal.js', content: 'export {};' }
                            ]
                        })
                    },
                    {
                        fileDescription: {
                            content: 'export {};',
                            isExecutable: false,
                            inputFilePath: '/source/internal.js',
                            targetFilePath: 'internal.js'
                        },
                        directDependencies: new Set(),
                        moduleReferences: [],
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
            exportPackageManifest: true,
            roots: {
                main: {
                    javaScript: {
                        content: '',
                        isExecutable: false,
                        inputFilePath: '/source/index.js',
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
                { filePath: '/source/index.js', content: 'import "./dep.js";' },
                { filePath: '/source/index.d.ts', content: 'export * from "./dep.d.ts";' }
            ]
        });
        const linker = createBundleLinker();
        const root = {
            javaScript: {
                content: '',
                isExecutable: false,
                inputFilePath: '/source/index.js',
                targetFilePath: 'index.js'
            },
            declarationFile: {
                content: '',
                isExecutable: false,
                inputFilePath: '/source/index.d.ts',
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
                            inputFilePath: '/source/index.js',
                            targetFilePath: 'index.js'
                        },
                        directDependencies: new Set([ 'dep.js' ]),
                        moduleReferences: [
                            {
                                type: 'local-code',
                                sourceSpecifier: './dep.js',
                                emittedSpecifier: './dep.js',
                                targetFilePath: 'dep.js'
                            }
                        ],
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'export * from "./dep.d.ts";',
                            isExecutable: false,
                            inputFilePath: '/source/index.d.ts',
                            targetFilePath: 'index.d.ts'
                        },
                        directDependencies: new Set([ 'dep.d.ts' ]),
                        moduleReferences: [
                            {
                                type: 'local-code',
                                sourceSpecifier: './dep.d.ts',
                                emittedSpecifier: './dep.d.ts',
                                targetFilePath: 'dep.d.ts'
                            }
                        ],
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'export const dep = 1;',
                            isExecutable: false,
                            inputFilePath: '/source/dep.js',
                            targetFilePath: 'dep.js'
                        },
                        directDependencies: new Set(),
                        moduleReferences: [],
                        isExplicitlyIncluded: false
                    },
                    {
                        fileDescription: {
                            content: 'export declare const dep: number;',
                            isExecutable: false,
                            inputFilePath: '/source/dep.d.ts',
                            targetFilePath: 'dep.d.ts'
                        },
                        directDependencies: new Set(),
                        moduleReferences: [],
                        isExplicitlyIncluded: false
                    }
                ],
                roots: { main: root },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                externalDependencies: new Map()
            },
            bundleDependencies: [ testBundleDependency([ '/source/dep.js', '/source/dep.d.ts' ]) ],
            bundlePeerDependencies: []
        });

        assert.strictEqual(result.contents.length, 2);
        assert.strictEqual(result.contents[0]?.isSubstituted, true);
        assert.deepStrictEqual(Array.from(result.linkedBundleDependencies.keys()), [ 'bundle-dependency' ]);
        assert.deepStrictEqual(
            result.substitutedInputFilePathsByPackageName,
            new Map([
                [ 'bundle-dependency', new Set([ '/source/dep.js', '/source/dep.d.ts' ]) ]
            ])
        );
    });

    test('linkBundle() excludes local declaration companions for substituted dependency sources', async function () {
        const project = createProject({
            withFiles: [
                { filePath: '/source/index.js', content: 'import "./dep.js";' },
                { filePath: '/source/dep.js', content: 'export const dep = 1;' },
                { filePath: '/source/dep.d.ts', content: 'export declare const dep: number;' }
            ]
        });
        const linker = createBundleLinker();
        const root = {
            javaScript: testFileDescription('/source/index.js', 'index.js', '')
        };

        const result = await linker.linkBundle({
            bundle: {
                name: 'package-a',
                contents: [
                    {
                        ...testResource('/source/index.js', 'index.js', 'import "./dep.js";', [ '/source/dep.js' ]),
                        project
                    },
                    testResource('/source/dep.js', 'dep.js', 'export const dep = 1;', []),
                    testResource('/source/dep.d.ts', 'dep.d.ts', 'export declare const dep: number;', [])
                ],
                roots: { main: root },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                externalDependencies: new Map()
            },
            bundleDependencies: [ testBundleDependency([ '/source/dep.js' ]) ],
            bundlePeerDependencies: []
        });

        assert.deepStrictEqual(inputFilePathsOf(result.contents), [ '/source/index.js' ]);
        assert.deepStrictEqual(Array.from(result.linkedBundleDependencies.keys()), [ 'bundle-dependency' ]);
    });

    test('linkBundle() keeps declaration companions for non-root js files', async function () {
        const root = testRootWithDeclaration();
        const result = await linkTestBundle(root, [
            testResource('/source/index.js', 'index.js', 'import "./public.js";', [ '/source/public.js' ]),
            testResource('/source/index.d.ts', 'index.d.ts', 'export declare const root: string;', []),
            testResource('/source/public.js', 'public.js', 'export const publicValue = "value";', []),
            testResource('/source/public.d.ts', 'public.d.ts', 'export declare const publicValue: string;', [])
        ]);

        assert.deepStrictEqual(
            inputFilePathsOf(result.contents),
            [ '/source/index.js', '/source/public.js', '/source/index.d.ts', '/source/public.d.ts' ]
        );
    });

    test('linkBundle() keeps private runtime files without retaining their substituted declaration companions', async function () {
        const runtimeProject = createProject({
            withFiles: [
                { filePath: '/source/index.js', content: 'import "./local.js";' },
                { filePath: '/source/local.js', content: 'export const local = 1;' }
            ]
        });
        const declarationProject = createProject({
            withFiles: [
                { filePath: '/source/index.d.ts', content: 'export type { Local } from "./local.d.ts";' },
                { filePath: '/source/local.d.ts', content: 'export interface Local {}' }
            ]
        });
        const result = await createBundleLinker().linkBundle({
            bundle: {
                name: 'package-a',
                roots: { main: testRootWithDeclaration() },
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                externalDependencies: new Map(),
                contents: [
                    {
                        ...testResource('/source/index.js', 'index.js', 'import "./local.js";', [ '/source/local.js' ]),
                        project: runtimeProject
                    },
                    {
                        ...testResource(
                            '/source/index.d.ts',
                            'index.d.ts',
                            'export type { Local } from "./local.d.ts";',
                            [
                                '/source/local.d.ts'
                            ]
                        ),
                        project: declarationProject
                    },
                    testResource('/source/local.js', 'local.js', 'export const local = 1;', []),
                    testResource('/source/local.d.ts', 'local.d.ts', 'export interface Local {}', [])
                ]
            },
            bundleDependencies: [ {
                name: 'package-b',
                surface: { mode: 'implicit', defaultModuleRoot: 'main' },
                roots: {
                    main: {
                        javaScript: testFileDescription('/dependency.js', 'dependency.js', ''),
                        declarationFile: testFileDescription(
                            '/source/local.d.ts',
                            'local.d.ts',
                            'export interface Local {}'
                        )
                    }
                },
                contents: [ testSubstitutionResource('/source/local.d.ts') ]
            } ],
            bundlePeerDependencies: []
        });

        assert.deepStrictEqual(inputFilePathsOf(result.contents), [
            '/source/index.js',
            '/source/local.js',
            '/source/index.d.ts'
        ]);
        assert.strictEqual(result.contents[0]?.fileDescription.content, 'import "./local.js";');
        assert.strictEqual(result.contents[2]?.fileDescription.content, 'export type { Local } from "package-b";');
    });

    test('linkBundle() keeps declaration roots that are not js companions', async function () {
        const root = {
            javaScript: testFileDescription('/source/index.js', 'index.js', ''),
            declarationFile: testFileDescription('/source/types/root.d.ts', 'types/root.d.ts', '')
        };
        const result = await linkTestBundle(root, [
            testResource('/source/index.js', 'index.js', 'export {};', []),
            testResource('/source/types/root.d.ts', 'types/root.d.ts', 'export {};', [])
        ]);

        assert.deepStrictEqual(
            inputFilePathsOf(result.contents),
            [ '/source/index.js', '/source/types/root.d.ts' ]
        );
    });

    test('linkBundle() tolerates explicit roots that share transitive files', async function () {
        const project = createProject({
            withFiles: [
                { filePath: '/source/cli.js', content: 'import "./shared.js";' },
                { filePath: '/source/worker.js', content: 'import "./shared.js";' },
                { filePath: '/source/shared.js', content: 'export const shared = 1;' }
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
                            inputFilePath: '/source/cli.js',
                            targetFilePath: 'cli.js'
                        },
                        directDependencies: new Set([ 'shared.js' ]),
                        moduleReferences: [],
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'import "./shared.js";',
                            isExecutable: false,
                            inputFilePath: '/source/worker.js',
                            targetFilePath: 'worker.js'
                        },
                        directDependencies: new Set([ '/source/shared.js' ]),
                        moduleReferences: [],
                        isExplicitlyIncluded: false,
                        project
                    },
                    {
                        fileDescription: {
                            content: 'export const shared = 1;',
                            isExecutable: false,
                            inputFilePath: '/source/shared.js',
                            targetFilePath: 'shared.js'
                        },
                        directDependencies: new Set(),
                        moduleReferences: [],
                        isExplicitlyIncluded: false,
                        project
                    }
                ],
                roots: {
                    commandLineInterface: {
                        javaScript: {
                            content: '#!/usr/bin/env node\nimport "./shared.js";',
                            isExecutable: true,
                            inputFilePath: '/source/cli.js',
                            targetFilePath: 'cli.js'
                        }
                    },
                    worker: {
                        javaScript: {
                            content: 'import "./shared.js";',
                            isExecutable: false,
                            inputFilePath: '/source/worker.js',
                            targetFilePath: 'worker.js'
                        }
                    }
                },
                surface: {
                    mode: 'explicit',
                    packageInterface: {
                        executables: [ { root: 'commandLineInterface', name: 'packtory' } ],
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
                    return entry.fileDescription.inputFilePath;
                })
                .toSorted(compareText),
            [ '/source/cli.js', '/source/worker.js', '/source/shared.js' ].toSorted(compareText)
        );
    });
});
