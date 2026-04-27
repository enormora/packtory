import assert from 'node:assert';
import { test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createBundleLinker } from './linker.ts';

test('linkBundle() keeps js-only entry points when there are no bundle substitutions', async () => {
    const linker = createBundleLinker();

    const result = await linker.linkBundle({
        bundle: {
            name: 'package-a',
            contents: [
                {
                    fileDescription: {
                        content: 'import "./internal.js";',
                        isExecutable: false,
                        sourceFilePath: '/src/index.js',
                        targetFilePath: 'index.js'
                    },
                    directDependencies: new Set(['/src/internal.js']),
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
            entryPoints: [
                {
                    js: {
                        content: '',
                        isExecutable: false,
                        sourceFilePath: '/src/index.js',
                        targetFilePath: 'index.js'
                    }
                }
            ],
            externalDependencies: new Map()
        },
        bundleDependencies: []
    });

    assert.strictEqual(result.name, 'package-a');
    assert.deepStrictEqual(result.entryPoints, [
        {
            js: {
                content: '',
                isExecutable: false,
                sourceFilePath: '/src/index.js',
                targetFilePath: 'index.js'
            }
        }
    ]);
    assert.strictEqual(result.contents.length, 2);
});

test('linkBundle() flattens declaration entry points and substitutes matching bundle dependencies', async () => {
    const project = createProject({
        withFiles: [
            { filePath: '/src/index.js', content: 'import "./dep.js";' },
            { filePath: '/src/index.d.ts', content: 'export * from "./dep.d.ts";' }
        ]
    });
    const linker = createBundleLinker();

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
                    directDependencies: new Set(['/src/dep.js']),
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
                    directDependencies: new Set(['/src/dep.d.ts']),
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
            entryPoints: [
                {
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
                }
            ],
            externalDependencies: new Map()
        },
        bundleDependencies: [
            {
                name: 'bundle-dependency',
                contents: [
                    {
                        fileDescription: {
                            content: '',
                            isExecutable: false,
                            sourceFilePath: '/src/dep.js',
                            targetFilePath: 'dep.js'
                        },
                        directDependencies: new Set(),
                        isSubstituted: false,
                        isExplicitlyIncluded: false
                    },
                    {
                        fileDescription: {
                            content: '',
                            isExecutable: false,
                            sourceFilePath: '/src/dep.d.ts',
                            targetFilePath: 'dep.d.ts'
                        },
                        directDependencies: new Set(),
                        isSubstituted: false,
                        isExplicitlyIncluded: false
                    }
                ]
            }
        ]
    });

    assert.strictEqual(result.contents.length, 2);
    assert.strictEqual(result.contents[0]?.isSubstituted, true);
    assert.deepStrictEqual(Array.from(result.linkedBundleDependencies.keys()), ['bundle-dependency']);
});
