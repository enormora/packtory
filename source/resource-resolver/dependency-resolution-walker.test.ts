/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import type { DependencyScanner } from '../dependency-scanner/scanner.ts';
import type { ResourceResolveOptions } from './resource-resolve-options.ts';
import { resolveDependenciesForAllRoots } from './dependency-resolution-walker.ts';

function emptyGraph() {
    return {
        flatten: () => ({ externalDependencies: new Map(), localFiles: [] })
    } as never;
}

function trackingScanner(): {
    readonly scanner: DependencyScanner;
    readonly calls: { readonly entry: string; readonly resolveDeclarationFiles: boolean }[];
} {
    const calls: { readonly entry: string; readonly resolveDeclarationFiles: boolean }[] = [];
    return {
        calls,
        scanner: {
            async scan(entry: string, _sourcesFolder: string, options: { readonly resolveDeclarationFiles: boolean }) {
                calls.push({ entry, resolveDeclarationFiles: options.resolveDeclarationFiles });
                return emptyGraph();
            }
        } as DependencyScanner
    };
}

const stubMainPackageJson = { name: 'pkg-a', version: '1.0.0', type: 'module' } as never;

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

test('resolveDependenciesForAllRoots scans every root js entry once', async () => {
    const { scanner, calls } = trackingScanner();
    await resolveDependenciesForAllRoots(
        scanner,
        optionsForRoots({
            main: { js: '/src/index.js' },
            other: { js: '/src/other.js' }
        })
    );

    assert.deepStrictEqual(calls.map((call) => call.entry).toSorted(), ['/src/index.js', '/src/other.js']);
});

test('resolveDependenciesForAllRoots also scans the declaration entry with resolveDeclarationFiles=true when present', async () => {
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
