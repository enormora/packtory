import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, stub } from 'sinon';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import {
    createTransferableFile,
    createGraph,
    createResolver,
    baseResolveOptions,
    configureScanForJavaScriptAndDeclarationGraphs,
    configureScanForThreeGraphs,
    configureScanForFourGraphs,
    typedBaseResolveOptions,
    hasContentSourcePath,
    assertPromotedDeclarationScan,
    assertFourthPromotedDeclarationScan,
    generatedManifestFixture,
    findGeneratedManifestResource,
    addGeneratedManifestDependency,
    assertGeneratedManifestResource
} from '../test-libraries/resource-resolver-fixtures.ts';

suite('resource-resolver', function () {
    test('resolve() scans js roots and additional files and returns their file descriptions', async function () {
        const javaScriptGraph = createGraph({
            rootFile: '/source/index.js',
            additionalLocalFiles: [ '/source/internal.js' ]
        });
        const scan = fake.resolves(javaScriptGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            ...baseResolveOptions,
            includeSourceMapFiles: true,
            additionalFiles: [ 'readme.md' ]
        });

        assert.deepStrictEqual(scan.firstCall.args, [
            '/source/index.js',
            '/source',
            {
                includeSourceMapFiles: true,
                resolveDeclarationFiles: false,
                mainPackageManifest: { type: 'module' }
            }
        ]);
        assertDeepSubset(result, {
            name: 'package-a',
            contents: {
                length: 3
            },
            roots: {
                main: { javaScript: createTransferableFile('/source/index.js', 'index.js'), declarationFile: undefined }
            }
        });
    });

    test('resolve() keeps declarationFile undefined when a root does not define one', async function () {
        const javaScriptGraph = createGraph({ rootFile: '/source/index.js' });
        const scan = fake.resolves(javaScriptGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve(baseResolveOptions);

        assert.strictEqual(result.roots.main?.declarationFile, undefined);
    });

    test('resolve() synthesizes generated manifest resources instead of reading them from disk', async function () {
        const graph = createGraph({ rootFile: '/source/index.js' });
        addGeneratedManifestDependency(graph);
        const { fileDescriptionCalls, fileManager, resolver } = generatedManifestFixture(graph);

        const result = await resolver.resolve({
            ...baseResolveOptions,
            mainPackageManifest: { type: 'module' }
        });
        const manifestResource = findGeneratedManifestResource(result);

        assertGeneratedManifestResource(manifestResource);
        assert.strictEqual(fileManager.getTransferableFileDescriptionCallCount(), 1);
        assert.deepStrictEqual(fileDescriptionCalls, [
            {
                inputFilePath: '/source/index.js',
                targetFilePath: 'index.js'
            }
        ]);
        assert.deepStrictEqual(fileManager.getTransferableFileDescriptionCall(0), {
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js'
        });
    });

    test('resolve() scans declaration roots separately and merges local and external dependencies', async function () {
        const javaScriptGraph = createGraph({
            rootFile: '/source/index.js',
            additionalLocalFiles: [ '/source/shared.js' ],
            externalDependencyName: 'left-pad'
        });
        const declarationGraph = createGraph({
            rootFile: '/source/index.d.ts',
            additionalLocalFiles: [ '/source/shared.js' ],
            externalDependencyName: 'typescript'
        });
        const scan = configureScanForJavaScriptAndDeclarationGraphs(javaScriptGraph, declarationGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            name: 'package-a',
            sourcesFolder: '/source',
            roots: { main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' } },
            includeSourceMapFiles: false,
            additionalFiles: [],
            mainPackageManifest: { type: 'module' }
        });

        assertDeepSubset(scan, {
            callCount: 2,
            secondCall: {
                arguments: [
                    '/source/index.d.ts',
                    '/source',
                    {
                        includeSourceMapFiles: false,
                        resolveDeclarationFiles: true,
                        mainPackageManifest: { type: 'module' }
                    }
                ]
            }
        });
        assert.deepStrictEqual(
            Array.from(result.externalDependencies.keys()).toSorted(function (left, right) {
                return left.localeCompare(right);
            }),
            [ 'left-pad', 'typescript' ]
        );
        assert.deepStrictEqual(result.roots, {
            main: {
                javaScript: createTransferableFile('/source/index.js', 'index.js'),
                declarationFile: createTransferableFile('/source/index.d.ts', 'index.d.ts')
            }
        });
    });

    suite('promoted declaration companions', function () {
        test('scans readable companions for typed packages', async function () {
            const promotedDeclarationGraph = createGraph({ rootFile: '/source/feature.d.ts' });
            const scan = configureScanForThreeGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' }),
                promotedDeclarationGraph
            );
            const { resolver } = createResolver({ readableFiles: [ '/source/feature.d.ts' ], scan });

            const result = await resolver.resolveWithPromotedDeclarationCompanions(
                typedBaseResolveOptions(),
                new Set([ '/source/feature.js' ])
            );

            assertPromotedDeclarationScan(scan, '/source/feature.d.ts');
            assert.strictEqual(hasContentSourcePath(result, '/source/feature.d.ts'), true);
        });

        test('uses the first readable companion candidate', async function () {
            const scan = configureScanForThreeGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' }),
                createGraph({ rootFile: '/source/module.d.ts' })
            );
            const { resolver } = createResolver({ readableFiles: [ '/source/module.d.ts' ], scan });

            await resolver.resolveWithPromotedDeclarationCompanions(
                typedBaseResolveOptions(),
                new Set([ '/source/module.mjs' ])
            );

            assert.deepStrictEqual(scan.thirdCall.args[0], '/source/module.d.ts');
        });

        test('skips unreadable companions', async function () {
            const scan = configureScanForJavaScriptAndDeclarationGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' })
            );
            const { resolver } = createResolver({ scan });

            await resolver.resolveWithPromotedDeclarationCompanions(
                typedBaseResolveOptions(),
                new Set([ '/source/feature.js' ])
            );

            assert.strictEqual(scan.callCount, 2);
        });

        test('ignores promoted source paths for untyped packages', async function () {
            const scan = fake.resolves(createGraph({ rootFile: '/source/index.js' }));
            const { resolver } = createResolver({ readableFiles: [ '/source/feature.d.ts' ], scan });

            await resolver.resolveWithPromotedDeclarationCompanions(
                baseResolveOptions,
                new Set([ '/source/feature.js' ])
            );

            assert.strictEqual(scan.callCount, 1);
        });

        test('scans promoted companions when one root among many has declarations', async function () {
            const scan = configureScanForFourGraphs(
                createGraph({ rootFile: '/source/index.js' }),
                createGraph({ rootFile: '/source/index.d.ts' }),
                createGraph({ rootFile: '/source/other.js' }),
                createGraph({ rootFile: '/source/feature.d.ts' })
            );
            const { resolver } = createResolver({ readableFiles: [ '/source/feature.d.ts' ], scan });

            await resolver.resolveWithPromotedDeclarationCompanions({
                ...baseResolveOptions,
                roots: {
                    main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' },
                    other: { javaScript: '/source/other.js' }
                }
            }, new Set([ '/source/feature.js' ]));

            assertFourthPromotedDeclarationScan(scan, '/source/feature.d.ts');
        });
    });

    test('resolve() preserves additional modern roots', async function () {
        const firstGraph = createGraph({ rootFile: '/source/index.js' });
        const secondGraph = createGraph({ rootFile: '/source/feature.js' });
        const scan = stub();
        scan.onFirstCall().resolves(firstGraph);
        scan.onSecondCall().resolves(secondGraph);
        const { resolver } = createResolver({ scan });

        const result = await resolver.resolve({
            ...baseResolveOptions,
            roots: {
                main: { javaScript: '/source/index.js' },
                feature: { javaScript: '/source/feature.js' }
            }
        });

        assert.deepStrictEqual(result.roots, {
            main: { javaScript: createTransferableFile('/source/index.js', 'index.js'), declarationFile: undefined },
            feature: {
                javaScript: createTransferableFile('/source/feature.js', 'feature.js'),
                declarationFile: undefined
            }
        });
    });

    test('resolve() throws when a root resource cannot be resolved from the scanned contents', async function () {
        const graph = createGraph({ rootFile: '/source/index.js' });
        const scan = fake.resolves(graph);
        const { resolver } = createResolver({
            scan,
            transferableFileDescriptionResponder() {
                return createTransferableFile('/source/not-the-entry.js');
            }
        });

        try {
            await resolver.resolve({
                name: 'package-a',
                sourcesFolder: '/source',
                roots: { main: { javaScript: '/source/index.js' } },
                includeSourceMapFiles: false,
                additionalFiles: [],
                mainPackageManifest: { type: 'module' }
            });
            assert.fail('Expected resolve() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve resource for root /source/index.js');
        }
    });

    test('resolve() throws when a declared root resource cannot be resolved from the scanned contents', async function () {
        const graph = createGraph({ rootFile: '/source/missing.js' });
        const scan = fake.resolves(graph);
        const { resolver } = createResolver({
            scan,
            transferableFileDescriptionResponder() {
                return createTransferableFile('/source/index.js');
            }
        });

        try {
            await resolver.resolve({
                ...baseResolveOptions,
                roots: { main: { javaScript: '/source/missing.js' } }
            });
            assert.fail('Expected resolve() should fail but it did not');
        } catch (error: unknown) {
            assert.strictEqual((error as Error).message, 'Failed to resolve resource for root /source/missing.js');
        }
    });

    test('preserves dependency reference paths outside the resolved content set', async function () {
        const graph = createGraph({ rootFile: '/source/index.js' });
        const { resolver } = createResolver({
            scan: fake.resolves({
                ...graph,
                flatten(rootFilePath: string) {
                    return {
                        ...graph.flatten(rootFilePath),
                        externalDependencies: new Map([ [ 'external', {
                            name: 'external',
                            referencedFrom: [ '/outside/types.d.ts' ],
                            references: [ {
                                targetFilePath: '/outside/types.d.ts',
                                sourceSpecifier: 'external',
                                emittedSpecifier: 'external'
                            } ]
                        } ] ])
                    };
                }
            })
        });
        const result = await resolver.resolve(baseResolveOptions);
        assert.deepStrictEqual(result.externalDependencies.get('external'), {
            name: 'external',
            referencedFrom: [ '/outside/types.d.ts' ],
            references: [ {
                targetFilePath: '/outside/types.d.ts',
                sourceSpecifier: 'external',
                emittedSpecifier: 'external'
            } ]
        });
    });
});
