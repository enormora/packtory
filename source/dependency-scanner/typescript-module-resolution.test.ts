import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import {
    packageTypeForResolvedFilePath,
    resolveTypescriptModuleFilePath
} from './typescript-module-resolution.ts';

type TestFile = {
    readonly filePath: string;
    readonly content: string;
};

function containingSourceFile(files: readonly TestFile[], filePath: string): SourceFile {
    const hasContainingFile = files.some(function (file) {
        return file.filePath === filePath;
    });
    return createProject({
        withFiles: [
            ...hasContainingFile ? [] : [ { filePath, content: 'export const value = 1;' } ],
            ...files
        ]
    })
        .getSourceFileOrThrow(filePath);
}

function resolvedPath(
    from: string,
    files: readonly TestFile[],
    filePath: string,
    resolutionMode: 'runtime' | 'type'
): string | undefined {
    return resolveTypescriptModuleFilePath({
        moduleSpecifier: from,
        containingSourceFile: containingSourceFile(files, filePath),
        resolutionMode
    });
}

function resolvedTypePath(from: string, files: readonly TestFile[]): string | undefined {
    return resolvedPath(from, files, '/project/src/index.ts', 'type');
}

function resolvedRuntimePath(from: string, files: readonly TestFile[]): string | undefined {
    return resolvedPath(from, files, '/project/src/index.ts', 'runtime');
}

function packageTypeFor(filePath: string, files: readonly TestFile[]): string | undefined {
    return packageTypeForResolvedFilePath({
        filePath,
        containingSourceFile: containingSourceFile(files, '/project/src/index.ts')
    });
}

function registerTypeResolutionTests(): void {
    test('resolveTypescriptModuleFilePath resolves package exports', function () {
        assert.strictEqual(
            resolvedTypePath('schema-lib', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"type":"module","exports":"./index.js"}'
                },
                { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema-lib/index.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves package subpaths', function () {
        assert.strictEqual(
            resolvedTypePath('@scope/schema-lib/mini', [
                {
                    filePath: '/project/node_modules/@scope/schema-lib/package.json',
                    content: '{"type":"module","exports":{"./mini":"./mini.mjs"}}'
                },
                { filePath: '/project/node_modules/@scope/schema-lib/mini.mjs', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/@scope/schema-lib/mini.mjs'
        );
    });

    test('resolveTypescriptModuleFilePath resolves relative modules', function () {
        assert.strictEqual(
            resolvedTypePath('./relative.js', [
                { filePath: '/project/src/relative.js', content: 'export const value = 1;' }
            ]),
            '/project/src/relative.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves package imports', function () {
        assert.strictEqual(
            resolvedTypePath('#shared', [
                {
                    filePath: '/project/src/package.json',
                    content: '{"type":"module","imports":{"#shared":"./shared.js"}}'
                },
                { filePath: '/project/src/shared.js', content: 'export const value = 1;' }
            ]),
            '/project/src/shared.js'
        );
    });

    test('resolveTypescriptModuleFilePath returns undefined for unresolved modules', function () {
        assert.strictEqual(resolvedTypePath('missing-lib', []), undefined);
    });
}

function registerRuntimePackageResolutionTests(): void {
    test('resolveTypescriptModuleFilePath resolves runtime package import targets', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib/features/mini', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content:
                        '{"type":"module","exports":{"./features/mini":{"types":"./mini/index.d.cts","import":"./mini/index.js"}}}'
                },
                {
                    filePath: '/project/node_modules/schema-lib/mini/index.d.cts',
                    content: 'export declare const value: 1;'
                },
                { filePath: '/project/node_modules/schema-lib/mini/index.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema-lib/mini/index.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves runtime root package exports', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content:
                        '{"type":"module","exports":{".":{"types":"./index.d.ts","import":"./index.js"},"./other":"./other.js"}}'
                },
                {
                    filePath: '/project/node_modules/schema-lib/index.d.ts',
                    content: 'export declare const value: 1;'
                },
                { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' },
                { filePath: '/project/node_modules/schema-lib/other.js', content: 'export const other = 1;' }
            ]),
            '/project/node_modules/schema-lib/index.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves runtime condition arrays', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib/mini', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"type":"module","exports":{"./mini":[null,{"default":"./mini.js"}]}}'
                },
                { filePath: '/project/node_modules/schema-lib/mini.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema-lib/mini.js'
        );
    });
}

function registerScopedRuntimePackageResolutionTests(): void {
    test('resolveTypescriptModuleFilePath resolves scoped runtime packages', function () {
        assert.strictEqual(
            resolvedRuntimePath('@scope/schema-lib/features/mini', [
                {
                    filePath: '/project/node_modules/@scope/schema-lib/package.json',
                    content:
                        '{"type":"module","exports":{"./features/mini":{"types":"./mini.d.cts","import":"./mini.js"}}}'
                },
                {
                    filePath: '/project/node_modules/@scope/schema-lib/mini.d.cts',
                    content: 'export declare const value: 1;'
                },
                {
                    filePath: '/project/node_modules/@scope/schema-lib/mini.js',
                    content: 'export const value = 1;'
                }
            ]),
            '/project/node_modules/@scope/schema-lib/mini.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves runtime root condition exports', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"type":"module","exports":{"types":"./index.d.cts","import":"./index.js"}}'
                },
                {
                    filePath: '/project/node_modules/schema-lib/index.d.cts',
                    content: 'export declare const value: 1;'
                },
                { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema-lib/index.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves scoped runtime package roots', function () {
        assert.strictEqual(
            resolvedRuntimePath('@scope/schema-lib', [
                {
                    filePath: '/project/node_modules/@scope/schema-lib/package.json',
                    content: '{"type":"module","exports":{".":{"types":"./index.d.cts","import":"./index.js"}}}'
                },
                {
                    filePath: '/project/node_modules/@scope/schema-lib/index.d.cts',
                    content: 'export declare const value: 1;'
                },
                {
                    filePath: '/project/node_modules/@scope/schema-lib/index.js',
                    content: 'export const value = 1;'
                }
            ]),
            '/project/node_modules/@scope/schema-lib/index.js'
        );
    });

    test('resolveTypescriptModuleFilePath rejects malformed scoped runtime packages', function () {
        assert.strictEqual(
            resolvedRuntimePath('@scope', [
                {
                    filePath: '/project/node_modules/@scope/undefined/package.json',
                    content: '{"type":"module","exports":"./wrong.js"}'
                },
                {
                    filePath: '/project/node_modules/@scope/undefined/wrong.js',
                    content: 'export const wrong = 1;'
                }
            ]),
            undefined
        );
    });
}

function registerRuntimePackageFallbackTests(): void {
    test('resolveTypescriptModuleFilePath keeps package imports out of package lookup', function () {
        assert.strictEqual(
            resolvedRuntimePath('#shared', [
                {
                    filePath: '/project/src/package.json',
                    content: '{"type":"module","imports":{"#shared":"./shared.js"}}'
                },
                { filePath: '/project/src/shared.js', content: 'export const value = 1;' },
                {
                    filePath: '/project/node_modules/#shared/package.json',
                    content: '{"type":"module","exports":"./wrong.js"}'
                },
                { filePath: '/project/node_modules/#shared/wrong.js', content: 'export const wrong = 1;' }
            ]),
            '/project/src/shared.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves module package main fields only', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"type":"module","main":"./index.js"}'
                },
                { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema-lib/index.js'
        );
        assert.strictEqual(
            resolvedRuntimePath('commonjs-lib', [
                {
                    filePath: '/project/node_modules/commonjs-lib/package.json',
                    content: '{"main":"./index.js"}'
                },
                { filePath: '/project/node_modules/commonjs-lib/index.js', content: 'export const value = 1;' }
            ]),
            undefined
        );
    });

    test('resolveTypescriptModuleFilePath resolves bare packages before local file paths', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib', [
                { filePath: '/project/src/schema-lib', content: 'export const local = 1;' },
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"type":"module","exports":"./index.js"}'
                },
                { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema-lib/index.js'
        );
        assert.strictEqual(
            resolvedRuntimePath('schema.lib', [
                { filePath: '/project/src/schema.lib.js', content: 'export const local = 1;' },
                {
                    filePath: '/project/node_modules/schema.lib/package.json',
                    content: '{"type":"module","exports":"./index.js"}'
                },
                { filePath: '/project/node_modules/schema.lib/index.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema.lib/index.js'
        );
    });

    test('resolveTypescriptModuleFilePath rejects invalid manifests and escaped package targets', function () {
        assert.strictEqual(
            resolvedRuntimePath('broken-lib', [
                {
                    filePath: '/project/node_modules/broken-lib/package.json',
                    content: '{'
                },
                { filePath: '/project/node_modules/broken-lib/index.js', content: 'export const value = 1;' }
            ]),
            undefined
        );
        assert.strictEqual(
            resolvedRuntimePath('escaping-lib', [
                {
                    filePath: '/project/node_modules/escaping-lib/package.json',
                    content: '{"type":"module","exports":"../outside.js"}'
                },
                { filePath: '/project/node_modules/outside.js', content: 'export const value = 1;' }
            ]),
            undefined
        );
        assert.strictEqual(
            resolvedRuntimePath('numeric-main-lib', [
                {
                    filePath: '/project/node_modules/numeric-main-lib/package.json',
                    content: '{"type":"module","main":1}'
                },
                { filePath: '/project/node_modules/numeric-main-lib/index.js', content: 'export const value = 1;' }
            ]),
            undefined
        );
    });

    test('resolveTypescriptModuleFilePath falls back to TypeScript for packages without manifests', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib', [
                { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' }
            ]),
            '/project/node_modules/schema-lib/index.js'
        );
    });
}

function registerRuntimeRelativeResolutionTests(): void {
    test('resolveTypescriptModuleFilePath resolves runtime relative import targets', function () {
        assert.strictEqual(
            resolvedPath(
                '../v4/mini/external.js',
                [
                    {
                        filePath: '/project/node_modules/schema-lib/mini/index.js',
                        content: 'export { value } from "../v4/mini/external.js";'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/v4/mini/external.js',
                        content: 'export const value = 1;'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/v4/mini/external.d.cts',
                        content: 'export declare const value: 1;'
                    }
                ],
                '/project/node_modules/schema-lib/mini/index.js',
                'runtime'
            ),
            '/project/node_modules/schema-lib/v4/mini/external.js'
        );
    });

    test('resolveTypescriptModuleFilePath resolves extensionless runtime relative imports', function () {
        assert.strictEqual(
            resolvedRuntimePath('./feature', [
                { filePath: '/project/src/feature.mjs', content: 'export const value = 1;' },
                { filePath: '/project/src/feature.js', content: 'export const wrong = 1;' }
            ]),
            '/project/src/feature.mjs'
        );
        assert.strictEqual(
            resolvedRuntimePath('./script', [
                { filePath: '/project/src/script.js', content: 'export const value = 1;' }
            ]),
            '/project/src/script.js'
        );
        assert.strictEqual(
            resolvedRuntimePath('./missing.js', [
                { filePath: '/project/src/missing.js.js', content: 'export const value = 1;' }
            ]),
            undefined
        );
    });
}

function registerRuntimeFallbackTests(): void {
    test('resolveTypescriptModuleFilePath does not use package module field fallback', function () {
        assert.strictEqual(
            resolvedRuntimePath('schema-lib', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"module":"./module.mjs"}'
                },
                { filePath: '/project/node_modules/schema-lib/module.mjs', content: 'export const value = 1;' }
            ]),
            undefined
        );
    });

    test('resolveTypescriptModuleFilePath rejects invalid resolution modes', function () {
        assert.strictEqual(
            resolvedPath(
                './feature.js',
                [
                    { filePath: '/project/src/feature.js', content: 'export const value = 1;' }
                ],
                '/project/src/index.ts',
                'invalid' as 'runtime'
            ),
            undefined
        );
    });
}

function registerPackageTypeTests(): void {
    test('packageTypeForResolvedFilePath reads the nearest valid package manifest type', function () {
        assert.strictEqual(
            packageTypeFor('/project/node_modules/schema-lib/nested/index.js', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"type":"module"}'
                },
                {
                    filePath: '/project/node_modules/schema-lib/nested/package.json',
                    content: '{"type":"commonjs"}'
                }
            ]),
            'commonjs'
        );
        assert.strictEqual(
            packageTypeFor('/project/node_modules/broken-lib/index.js', [
                {
                    filePath: '/project/node_modules/broken-lib/package.json',
                    content: '{'
                }
            ]),
            undefined
        );
        assert.strictEqual(
            packageTypeFor('/project/node_modules/schema-lib/nested/index.js', [
                {
                    filePath: '/project/node_modules/schema-lib/package.json',
                    content: '{"type":"module"}'
                }
            ]),
            'module'
        );
    });
}

suite('typescript module resolution', function () {
    registerTypeResolutionTests();
    registerRuntimePackageResolutionTests();
    registerScopedRuntimePackageResolutionTests();
    registerRuntimePackageFallbackTests();
    registerRuntimeRelativeResolutionTests();
    registerRuntimeFallbackTests();
    registerPackageTypeTests();
});
