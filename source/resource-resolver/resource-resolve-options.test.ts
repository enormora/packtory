import assert from 'node:assert';
import { suite, test } from 'mocha';
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

suite('resource-resolve-options', function () {
    test('resolveRootsAndSurface() derives an implicit surface defaulting to the first root', function () {
        const result = resolveRootsAndSurface({
            ...baseOptions(),
            roots: { feature: helperRoot, main: mainRoot }
        });

        assert.deepStrictEqual(result, {
            roots: { feature: helperRoot, main: mainRoot },
            surface: { mode: 'implicit', defaultModuleRoot: 'feature' }
        });
    });

    test('resolveRootsAndSurface() preserves an explicit surface override', function () {
        const result = resolveRootsAndSurface({
            ...baseOptions(),
            roots: { main: mainRoot, helper: helperRoot },
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
            }
        });
    });

    test('resolveRootsAndSurface() throws when roots are empty', function () {
        assert.throws(() => {
            resolveRootsAndSurface({
                ...baseOptions(),
                roots: {}
            } as ResourceResolveOptions);
        }, /^Error: Package "package-a" must define at least one root$/u);
    });
});
