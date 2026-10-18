import assert from 'node:assert';
import { suite, test } from 'mocha';
import { moduleReferenceKind } from '../dependency-scanner/source-file-references.ts';
import { combineAllBundleFiles } from './content.ts';

function assertDefined<T>(value: T | undefined): asserts value is T {
    if (value === undefined) {
        assert.fail('expected value to be defined');
    }
}

function registerLocalFileTests(): void {
    test('combines all bundle files correctly', function () {
        const result = combineAllBundleFiles('/foo', [], []);
        assert.deepStrictEqual(result, []);
    });

    test('rewrites local dependency paths to target paths and derives target paths from sourcesFolder', function () {
        const result = combineAllBundleFiles(
            '/source',
            [
                {
                    filePath: '/source/nested/index.js',
                    directDependencies: new Set([ '/source/nested/internal.js' ]),
                    moduleReferences: [],
                    project: 'project' as never
                },
                {
                    filePath: '/source/nested/internal.js',
                    directDependencies: new Set(),
                    moduleReferences: [],
                    project: 'project' as never
                }
            ],
            []
        );

        assert.deepStrictEqual(result, [
            {
                inputFilePath: '/source/nested/index.js',
                targetFilePath: 'nested/index.js',
                directDependencies: new Set([ 'nested/internal.js' ]),
                moduleReferences: [],
                project: 'project',
                isExplicitlyIncluded: false
            },
            {
                inputFilePath: '/source/nested/internal.js',
                targetFilePath: 'nested/internal.js',
                directDependencies: new Set(),
                moduleReferences: [],
                project: 'project',
                isExplicitlyIncluded: false
            }
        ]);
    });
}

function registerModuleReferenceTests(): void {
    test('rewrites scanner module references to artifact target paths', function () {
        const result = combineAllBundleFiles(
            '/source',
            [
                {
                    filePath: '/source/index.js',
                    directDependencies: new Set([ '/source/live.js', '/source/data.json', '/package.json' ]),
                    moduleReferences: [
                        {
                            kind: moduleReferenceKind.localCode,
                            filePath: '/source/live.js',
                            sourceSpecifier: './live',
                            emittedSpecifier: './live.js'
                        },
                        {
                            kind: moduleReferenceKind.localAsset,
                            filePath: '/source/data.json',
                            sourceSpecifier: './data.json',
                            emittedSpecifier: './data.json'
                        },
                        {
                            kind: moduleReferenceKind.generatedManifest,
                            filePath: '/package.json',
                            sourceSpecifier: './package.json',
                            emittedSpecifier: './package.json'
                        },
                        {
                            kind: moduleReferenceKind.externalPackage,
                            packageName: 'dep',
                            sourceSpecifier: 'dep/source',
                            emittedSpecifier: 'dep'
                        }
                    ],
                    project: 'project' as never
                },
                { filePath: '/source/live.js', directDependencies: new Set(), moduleReferences: [] },
                { filePath: '/source/data.json', directDependencies: new Set(), moduleReferences: [] },
                {
                    filePath: '/package.json',
                    directDependencies: new Set(),
                    moduleReferences: [],
                    isGeneratedManifest: true
                }
            ],
            []
        );

        const [ indexResource ] = result;
        assertDefined(indexResource);
        assert.deepStrictEqual(
            {
                directDependencies: indexResource.directDependencies,
                moduleReferences: indexResource.moduleReferences
            },
            {
                directDependencies: new Set([ 'live.js', 'data.json', 'package.json' ]),
                moduleReferences: [
                    {
                        type: 'local-code',
                        targetFilePath: 'live.js',
                        sourceSpecifier: './live',
                        emittedSpecifier: './live.js'
                    },
                    {
                        type: 'local-asset',
                        targetFilePath: 'data.json',
                        sourceSpecifier: './data.json',
                        emittedSpecifier: './data.json'
                    },
                    {
                        type: 'generated-manifest',
                        targetFilePath: 'package.json',
                        sourceSpecifier: './package.json',
                        emittedSpecifier: './package.json'
                    },
                    {
                        type: 'external-package',
                        packageName: 'dep',
                        sourceSpecifier: 'dep/source',
                        emittedSpecifier: 'dep'
                    }
                ]
            }
        );
    });

    test('rejects local module references missing from bundle contents', function () {
        assert.throws(
            function () {
                combineAllBundleFiles(
                    '/source',
                    [
                        {
                            filePath: '/source/index.js',
                            directDependencies: new Set(),
                            moduleReferences: [
                                {
                                    kind: moduleReferenceKind.localCode,
                                    filePath: '/source/missing.js',
                                    sourceSpecifier: './missing.js',
                                    emittedSpecifier: './missing.js'
                                }
                            ]
                        }
                    ],
                    []
                );
            },
            { message: 'Resolved local reference "/source/missing.js" is missing from bundle contents' }
        );
    });
}

function registerLocalValidationTests(): void {
    test('rejects local dependency paths outside sourcesFolder', function () {
        assert.throws(
            function () {
                combineAllBundleFiles(
                    '/source',
                    [
                        {
                            filePath: '/secret.js',
                            directDependencies: new Set(),
                            moduleReferences: [],
                            project: 'project' as never
                        }
                    ],
                    []
                );
            },
            {
                message: 'Local file "/secret.js" must resolve to a valid bundle target inside "/source"'
            }
        );
    });

    test('rejects local dependency paths that resolve to sourcesFolder itself', function () {
        assert.throws(
            function () {
                combineAllBundleFiles(
                    '/source',
                    [
                        {
                            filePath: '/source',
                            directDependencies: new Set(),
                            moduleReferences: [],
                            project: 'project' as never
                        }
                    ],
                    []
                );
            },
            {
                message: 'Local file "/source" must resolve to a valid bundle target inside "/source"'
            }
        );
    });

    test('pins generated manifest resources to package.json at package root', function () {
        const result = combineAllBundleFiles(
            '/source',
            [
                {
                    filePath: '/package.json',
                    directDependencies: new Set(),
                    moduleReferences: [],
                    isGeneratedManifest: true
                }
            ],
            []
        );

        assert.deepStrictEqual(result, [
            {
                inputFilePath: '/package.json',
                targetFilePath: 'package.json',
                directDependencies: new Set(),
                moduleReferences: [],
                isExplicitlyIncluded: false,
                isGeneratedManifest: true
            }
        ]);
    });

    test('normalizes object-form additional files and marks them as explicitly included', function () {
        const result = combineAllBundleFiles(
            '/source',
            [],
            [
                { inputFilePath: 'assets/readme.md', targetFilePath: 'readme.md' },
                { inputFilePath: '/absolute/license.txt', targetFilePath: 'license.txt' }
            ]
        );

        assert.deepStrictEqual(result, [
            {
                inputFilePath: '/source/assets/readme.md',
                targetFilePath: 'readme.md',
                directDependencies: new Set(),
                moduleReferences: [],
                isExplicitlyIncluded: true
            },
            {
                inputFilePath: '/absolute/license.txt',
                targetFilePath: 'license.txt',
                directDependencies: new Set(),
                moduleReferences: [],
                isExplicitlyIncluded: true
            }
        ]);
    });

    test('marks string-form additional files as explicitly included', function () {
        const result = combineAllBundleFiles('/source', [], [ 'readme.md' ]);

        assert.deepStrictEqual(result, [
            {
                inputFilePath: '/source/readme.md',
                targetFilePath: 'readme.md',
                directDependencies: new Set(),
                moduleReferences: [],
                isExplicitlyIncluded: true
            }
        ]);
    });

    test('throws when an object-form additional file uses an absolute target path', function () {
        try {
            combineAllBundleFiles('/source', [], [ {
                inputFilePath: 'file.txt',
                targetFilePath: '/absolute/file.txt'
            } ]);
            assert.fail('Expected combineAllBundleFiles() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'The targetFilePath must be relative');
        }
    });

    test('throws when an object-form additional file targets the generated package manifest', function () {
        try {
            combineAllBundleFiles(
                '/source',
                [],
                [ { inputFilePath: 'manifest-template.json', targetFilePath: 'package.json' } ]
            );
            assert.fail('Expected combineAllBundleFiles() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual(
                (error as Error).message,
                'additionalFiles must not target generated package manifest "package.json".'
            );
        }
    });
}

function registerLocalManifestValidationTests(): void {
    test('rejects non-generated local files that target the generated package manifest', function () {
        assert.throws(
            function () {
                combineAllBundleFiles(
                    '/source',
                    [
                        {
                            filePath: '/source/package.json',
                            directDependencies: new Set(),
                            moduleReferences: []
                        }
                    ],
                    []
                );
            },
            {
                message: 'Local file "/source/package.json" must resolve to a valid bundle target inside "/source"'
            }
        );
    });

    test('keeps nested package.json local files as package content', function () {
        const result = combineAllBundleFiles(
            '/source',
            [
                {
                    filePath: '/source/fixtures/package.json',
                    directDependencies: new Set(),
                    moduleReferences: []
                }
            ],
            []
        );

        assert.deepStrictEqual(result, [
            {
                inputFilePath: '/source/fixtures/package.json',
                targetFilePath: 'fixtures/package.json',
                directDependencies: new Set(),
                moduleReferences: [],
                isExplicitlyIncluded: false
            }
        ]);
    });
}

const additionalCodeFileErrorMessage = [
    'additionalFiles must not include code files; received "lib/template.ts".',
    'Code that should ship in the bundle must be reachable from a root so',
    'dependency, side-effect and dead-code analyses can run on it.',
    'If you intend to ship code as a static asset (e.g. a template),',
    'use a non-code extension like .txt.'
]
    .join(' ');

function registerAdditionalFileValidationTests(): void {
    test('throws when a string-form additional file points at a code file', function () {
        try {
            combineAllBundleFiles('/source', [], [ 'lib/template.ts' ]);
            assert.fail('Expected combineAllBundleFiles() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, additionalCodeFileErrorMessage);
        }
    });

    test('throws when an object-form additional file targets a code file', function () {
        try {
            combineAllBundleFiles(
                '/source',
                [],
                [ { inputFilePath: 'assets/template.txt', targetFilePath: 'lib/template.ts' } ]
            );
            assert.fail('Expected combineAllBundleFiles() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, additionalCodeFileErrorMessage);
        }
    });

    test('accepts an additional file whose target path retains a code-shaped source via a non-code extension', function () {
        const result = combineAllBundleFiles(
            '/source',
            [],
            [ { inputFilePath: 'fixtures/template.ts', targetFilePath: 'fixtures/template.ts.txt' } ]
        );
        assert.deepStrictEqual(result, [
            {
                inputFilePath: '/source/fixtures/template.ts',
                targetFilePath: 'fixtures/template.ts.txt',
                directDependencies: new Set(),
                moduleReferences: [],
                isExplicitlyIncluded: true
            }
        ]);
    });
}

suite('content', function () {
    registerLocalFileTests();
    registerModuleReferenceTests();
    registerLocalValidationTests();
    registerLocalManifestValidationTests();
    registerAdditionalFileValidationTests();
});
