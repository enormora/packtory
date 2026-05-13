import assert from 'node:assert';
import { test } from 'mocha';
import { resolveRootsAndSurface, type ResourceResolveOptions } from './resource-resolve-options.ts';

const mainRoot = { js: '/src/index.js', declarationFile: '/src/index.d.ts' } as const;
const helperRoot = { js: '/src/helper.js' } as const;

type BaseOptions = {
    readonly name: string;
    readonly sourcesFolder: string;
    readonly includeSourceMapFiles: boolean;
    readonly additionalFiles: readonly [];
    readonly mainPackageJson: { readonly type: 'module' };
};

function baseOptions(): BaseOptions {
    return {
        name: 'package-a',
        sourcesFolder: '/src',
        includeSourceMapFiles: false,
        additionalFiles: [],
        mainPackageJson: { type: 'module' }
    };
}

test('resolveRootsAndSurface() derives modern entryPoints and an implicit surface from roots', () => {
    const result = resolveRootsAndSurface({
        ...baseOptions(),
        roots: { feature: helperRoot, main: mainRoot }
    });

    assert.deepStrictEqual(result, {
        roots: { feature: helperRoot, main: mainRoot },
        surface: { mode: 'implicit', defaultModuleRoot: 'feature' },
        entryPoints: [helperRoot, mainRoot]
    });
});

test('resolveRootsAndSurface() preserves explicit modern surface and entryPoints overrides', () => {
    const result = resolveRootsAndSurface({
        ...baseOptions(),
        roots: { main: mainRoot, helper: helperRoot },
        entryPoints: [mainRoot],
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'main', export: '.' }]
            }
        }
    });

    assert.deepStrictEqual(result, {
        roots: { main: mainRoot, helper: helperRoot },
        surface: {
            mode: 'explicit',
            packageInterface: {
                modules: [{ root: 'main', export: '.' }]
            }
        },
        entryPoints: [mainRoot]
    });
});

test('resolveRootsAndSurface() throws when modern roots are empty', () => {
    assert.throws(() => {
        resolveRootsAndSurface({
            ...baseOptions(),
            roots: {}
        } as ResourceResolveOptions);
    }, /^Error: Package "package-a" must define at least one root$/u);
});

test('resolveRootsAndSurface() rejects empty modern roots even when explicit entryPoints are provided', () => {
    assert.throws(() => {
        resolveRootsAndSurface({
            ...baseOptions(),
            roots: {},
            entryPoints: [mainRoot]
        } as ResourceResolveOptions);
    }, /^Error: Package "package-a" must define at least one root$/u);
});

test('resolveRootsAndSurface() converts legacy entryPoints into named roots', () => {
    const entryPoints = [mainRoot, helperRoot] as const;
    const result = resolveRootsAndSurface({
        ...baseOptions(),
        entryPoints
    } as ResourceResolveOptions);

    assert.deepStrictEqual(result, {
        roots: { main: mainRoot, entry2: helperRoot },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        entryPoints
    });
});

test('resolveRootsAndSurface() still treats legacy entryPoints as legacy when roots is explicitly undefined', () => {
    const entryPoints = [mainRoot] as const;
    const result = resolveRootsAndSurface({
        ...baseOptions(),
        entryPoints,
        roots: undefined
    } as ResourceResolveOptions);

    assert.deepStrictEqual(result, {
        roots: { main: mainRoot },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        entryPoints
    });
});
