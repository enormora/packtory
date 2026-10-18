import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { DependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { FileManager } from '../file-manager/file-manager.ts';
import type { ResourceResolveOptions } from './resource-resolve-options.ts';
import { resolveDependenciesForAllRoots } from './dependency-resolution-walker.ts';

type ScanCall = {
    readonly entries: readonly string[];
    readonly resolveDeclarationFiles: boolean;
};

type TrackingScanner = {
    readonly scanner: DependencyScanner;
    readonly calls: readonly ScanCall[];
};
type ReadabilityFileManager = Pick<FileManager, 'checkReadability'>;

function emptyGraph(): DependencyGraph {
    return {
        addDependency() {
            return undefined;
        },
        connect() {
            return undefined;
        },
        hasConnection() {
            return false;
        },
        isKnown() {
            return false;
        },
        walk() {
            return undefined;
        },
        flatten() {
            return { externalDependencies: new Map(), localFiles: [] };
        }
    };
}

function graphWithFiles(rootFile: string, additionalLocalFiles: readonly string[]): DependencyGraph {
    return {
        ...emptyGraph(),
        flatten() {
            return {
                externalDependencies: new Map(),
                localFiles: [
                    { directDependencies: new Set(additionalLocalFiles), filePath: rootFile, moduleReferences: [] },
                    ...additionalLocalFiles.map(function (filePath) {
                        return { directDependencies: new Set<string>(), filePath, moduleReferences: [] };
                    })
                ]
            };
        }
    };
}

function trackingScanner(): TrackingScanner {
    const calls: ScanCall[] = [];
    const scanner: DependencyScanner = {
        async scan(entry, _sourcesFolder, options) {
            calls.push({ entries: [ entry ], resolveDeclarationFiles: options.resolveDeclarationFiles ?? false });
            return emptyGraph();
        },
        async scanEntries(entries, _sourcesFolder, options) {
            calls.push({ entries, resolveDeclarationFiles: options.resolveDeclarationFiles ?? false });
            return emptyGraph();
        }
    };
    return {
        calls,
        scanner
    };
}

function scannerWithGraphs(graphEntries: readonly (readonly [string, DependencyGraph])[]): TrackingScanner {
    const graphs = new Map(graphEntries);
    const calls: ScanCall[] = [];
    const scanner: DependencyScanner = {
        async scan(entry, _sourcesFolder, options) {
            calls.push({ entries: [ entry ], resolveDeclarationFiles: options.resolveDeclarationFiles ?? false });
            return graphs.get(entry) ?? emptyGraph();
        },
        async scanEntries(entryFiles, _sourcesFolder, options) {
            calls.push({ entries: entryFiles, resolveDeclarationFiles: options.resolveDeclarationFiles ?? false });
            return {
                ...emptyGraph(),
                flatten(entry) {
                    return (graphs.get(entry) ?? emptyGraph()).flatten(entry);
                }
            };
        }
    };
    return {
        calls,
        scanner
    };
}

function alwaysUnreadable(): ReadabilityFileManager {
    return {
        async checkReadability() {
            return { isReadable: false };
        }
    };
}

function readableFiles(files: readonly string[]): ReadabilityFileManager {
    const fileSet = new Set(files);
    return {
        async checkReadability(fileOrFolderPath) {
            return { isReadable: fileSet.has(fileOrFolderPath) };
        }
    };
}

const stubMainPackageManifest = { type: 'module' } as const;

function optionsForRoots(roots: ResourceResolveOptions['roots']): ResourceResolveOptions {
    return {
        name: 'package-a',
        sourcesFolder: '/source',
        mainPackageManifest: stubMainPackageManifest,
        includeSourceMapFiles: false,
        additionalFiles: [],
        roots
    };
}

suite('dependency-resolution-walker', function () {
    test('resolveDependenciesForAllRoots scans every root js entry once', async function () {
        const { scanner, calls } = trackingScanner();
        await resolveDependenciesForAllRoots(
            { dependencyScanner: scanner, fileManager: alwaysUnreadable() },
            optionsForRoots({
                main: { javaScript: '/source/index.js' },
                other: { javaScript: '/source/other.js' }
            }),
            []
        );

        assert.deepStrictEqual(
            calls
                .flatMap(function (call) {
                    return call.entries;
                })
                .toSorted(function (left, right) {
                    return left.localeCompare(right);
                }),
            [ '/source/index.js', '/source/other.js' ]
        );
    });

    test('resolveDependenciesForAllRoots also scans the declaration entry with resolveDeclarationFiles=true when present', async function () {
        const { scanner, calls } = trackingScanner();
        await resolveDependenciesForAllRoots(
            { dependencyScanner: scanner, fileManager: alwaysUnreadable() },
            optionsForRoots({ main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' } }),
            []
        );

        assert.deepStrictEqual(calls, [
            { entries: [ '/source/index.js' ], resolveDeclarationFiles: false },
            { entries: [ '/source/index.d.ts' ], resolveDeclarationFiles: true }
        ]);
    });

    test('resolveDependenciesForAllRoots skips declaration companions for js dependencies in typed packages', async function () {
        const { scanner, calls } = scannerWithGraphs([
            [ '/source/index.js', graphWithFiles('/source/index.js', [ '/source/internal.js' ]) ],
            [ '/source/internal.d.ts', graphWithFiles('/source/internal.d.ts', []) ]
        ]);

        const result = await resolveDependenciesForAllRoots(
            { dependencyScanner: scanner, fileManager: readableFiles([ '/source/internal.d.ts' ]) },
            optionsForRoots({ main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' } }),
            []
        );
        const indexFile = result.localFiles.find(function (localFile) {
            return localFile.filePath === '/source/index.js';
        });

        assert.deepStrictEqual(calls, [
            { entries: [ '/source/index.js' ], resolveDeclarationFiles: false },
            { entries: [ '/source/index.d.ts' ], resolveDeclarationFiles: true }
        ]);
        assert.deepStrictEqual(indexFile?.directDependencies, new Set([ '/source/internal.js' ]));
        const internalDeclarationFile = result.localFiles.find(function (localFile) {
            return localFile.filePath === '/source/internal.d.ts';
        });
        assert.strictEqual(internalDeclarationFile, undefined);
    });

    test('resolveDependenciesForAllRoots scans a shared declaration root once', async function () {
        const { scanner, calls } = trackingScanner();
        await resolveDependenciesForAllRoots(
            { dependencyScanner: scanner, fileManager: alwaysUnreadable() },
            optionsForRoots({
                main: { javaScript: '/source/index.js', declarationFile: '/source/shared.d.ts' },
                other: { javaScript: '/source/other.js', declarationFile: '/source/shared.d.ts' }
            }),
            []
        );

        assert.deepStrictEqual(calls, [
            { entries: [ '/source/index.js' ], resolveDeclarationFiles: false },
            { entries: [ '/source/shared.d.ts' ], resolveDeclarationFiles: true },
            { entries: [ '/source/other.js' ], resolveDeclarationFiles: false }
        ]);
    });

    test('resolveDependenciesForAllRoots does not scan root js declaration companions', async function () {
        const { scanner, calls } = scannerWithGraphs([
            [ '/source/index.js', graphWithFiles('/source/index.js', []) ]
        ]);

        await resolveDependenciesForAllRoots(
            { dependencyScanner: scanner, fileManager: readableFiles([ '/source/index.d.ts' ]) },
            optionsForRoots({ main: { javaScript: '/source/index.js', declarationFile: '/source/types.d.ts' } }),
            []
        );

        assert.deepStrictEqual(calls, [
            { entries: [ '/source/index.js' ], resolveDeclarationFiles: false },
            { entries: [ '/source/types.d.ts' ], resolveDeclarationFiles: true }
        ]);
    });

    test('resolveDependenciesForAllRoots skips declaration companions for js-only packages', async function () {
        const { scanner, calls } = scannerWithGraphs([
            [ '/source/index.js', graphWithFiles('/source/index.js', [ '/source/internal.js' ]) ]
        ]);

        await resolveDependenciesForAllRoots(
            { dependencyScanner: scanner, fileManager: readableFiles([ '/source/internal.d.ts' ]) },
            optionsForRoots({ main: { javaScript: '/source/index.js' } }),
            []
        );

        assert.deepStrictEqual(calls, [ { entries: [ '/source/index.js' ], resolveDeclarationFiles: false } ]);
    });

    test('resolveDependenciesForAllRoots scans promoted declaration companions', async function () {
        const { scanner, calls } = scannerWithGraphs([
            [ '/source/other.js', graphWithFiles('/source/other.js', [ '/source/internal.js' ]) ],
            [ '/source/internal.d.ts', graphWithFiles('/source/internal.d.ts', []) ]
        ]);

        await resolveDependenciesForAllRoots(
            { dependencyScanner: scanner, fileManager: readableFiles([ '/source/internal.d.ts' ]) },
            optionsForRoots({
                main: { javaScript: '/source/index.js', declarationFile: '/source/index.d.ts' },
                other: { javaScript: '/source/other.js' }
            }),
            [ '/source/internal.d.ts' ]
        );

        assert.deepStrictEqual(calls, [
            { entries: [ '/source/index.js' ], resolveDeclarationFiles: false },
            { entries: [ '/source/index.d.ts' ], resolveDeclarationFiles: true },
            { entries: [ '/source/other.js' ], resolveDeclarationFiles: false },
            { entries: [ '/source/internal.d.ts' ], resolveDeclarationFiles: true }
        ]);
    });
});
