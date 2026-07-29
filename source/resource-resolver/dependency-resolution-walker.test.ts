import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { DependencyGraph } from '../dependency-scanner/dependency-graph.ts';
import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { ResourceResolveOptions } from './resource-resolve-options.ts';
import { resolveDependenciesForAllRoots } from './dependency-resolution-walker.ts';

type ScanCall = {
    readonly entry: string;
    readonly resolveDeclarationFiles: boolean;
};

type TrackingScanner = {
    readonly scanner: DependencyScanner;
    readonly calls: readonly ScanCall[];
};

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

function trackingScanner(): TrackingScanner {
    const calls: ScanCall[] = [];
    const scanner: DependencyScanner = {
        async scan(entry, _sourcesFolder, options) {
            calls.push({ entry, resolveDeclarationFiles: options.resolveDeclarationFiles ?? false });
            return emptyGraph();
        }
    };
    return {
        calls,
        scanner
    };
}

const stubMainPackageJson = { type: 'module' } as const;

function optionsForRoots(roots: ResourceResolveOptions['roots']): ResourceResolveOptions {
    return {
        name: 'pkg-a',
        sourcesFolder: '/src',
        mainPackageJson: stubMainPackageJson,
        includeSourceMapFiles: false,
        additionalFiles: [],
        roots
    };
}

suite('dependency-resolution-walker', function () {
    test('resolveDependenciesForAllRoots scans every root js entry once', async function () {
        const { scanner, calls } = trackingScanner();
        await resolveDependenciesForAllRoots(
            scanner,
            optionsForRoots({
                main: { js: '/src/index.js' },
                other: { js: '/src/other.js' }
            })
        );

        assert.deepStrictEqual(
            calls
                .map(function (call) {
                    return call.entry;
                })
                .toSorted(function (left, right) {
                    return left.localeCompare(right);
                }),
            [ '/src/index.js', '/src/other.js' ]
        );
    });

    test('resolveDependenciesForAllRoots also scans the declaration entry with resolveDeclarationFiles=true when present', async function () {
        const { scanner, calls } = trackingScanner();
        await resolveDependenciesForAllRoots(
            scanner,
            optionsForRoots({ main: { js: '/src/index.js', declarationFile: '/src/index.d.ts' } })
        );

        assert.deepStrictEqual(calls, [
            { entry: '/src/index.js', resolveDeclarationFiles: false },
            { entry: '/src/index.d.ts', resolveDeclarationFiles: true }
        ]);
    });
});
