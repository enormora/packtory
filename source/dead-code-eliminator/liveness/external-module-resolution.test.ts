import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { resolveModuleSourceFile } from './external-module-resolution.ts';

type TestFile = {
    readonly filePath: string;
    readonly content: string;
};

function containingSourceFile(files: readonly TestFile[], filePath = '/project/src/index.ts'): SourceFile {
    return createProject({
        withFiles: [
            { filePath, content: 'export const value = 1;' },
            ...files
        ]
    })
        .getSourceFileOrThrow(filePath);
}

function resolvedPath(from: string, files: readonly TestFile[], filePath?: string): string | undefined {
    return resolveModuleSourceFile(
        from,
        containingSourceFile(files, filePath)
    )
        ?.getFilePath();
}

suite('external module resolution', function () {
    suite('accepted targets', function () {
        test('resolveModuleSourceFile resolves an unscoped package export string', function () {
            assert.strictEqual(
                resolvedPath('schema-lib', [
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"type":"module","exports":"./index.js"}'
                    },
                    { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/schema-lib/index.js'
            );
        });

        test('resolveModuleSourceFile resolves scoped package subpath exports', function () {
            assert.strictEqual(
                resolvedPath('@scope/schema-lib/mini', [
                    {
                        filePath: '/project/node_modules/@scope/schema-lib/package.json',
                        content: '{"type":"module","exports":{"./mini":"./mini.mjs"}}'
                    },
                    { filePath: '/project/node_modules/@scope/schema-lib/mini.mjs', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/@scope/schema-lib/mini.mjs'
            );
        });

        test('resolveModuleSourceFile resolves scoped multi-segment package subpaths', function () {
            assert.strictEqual(
                resolvedPath('@scope/schema-lib/foo/bar', [
                    {
                        filePath: '/project/node_modules/@scope/schema-lib/package.json',
                        content: '{"type":"module","exports":{"./foo/bar":"./nested.mjs"}}'
                    },
                    {
                        filePath: '/project/node_modules/@scope/schema-lib/nested.mjs',
                        content: 'export const value = 1;'
                    }
                ]),
                '/project/node_modules/@scope/schema-lib/nested.mjs'
            );
        });

        test('resolveModuleSourceFile resolves scoped package root exports', function () {
            assert.strictEqual(
                resolvedPath('@scope/schema-lib', [
                    {
                        filePath: '/project/node_modules/@scope/schema-lib/package.json',
                        content: '{"type":"module","exports":"./index.js"}'
                    },
                    { filePath: '/project/node_modules/@scope/schema-lib/index.js', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/@scope/schema-lib/index.js'
            );
        });

        test('resolveModuleSourceFile resolves multi-segment package subpaths', function () {
            assert.strictEqual(
                resolvedPath('schema-lib/foo/bar', [
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"type":"module","exports":{"./foo/bar":"./nested.mjs"}}'
                    },
                    { filePath: '/project/node_modules/schema-lib/nested.mjs', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/schema-lib/nested.mjs'
            );
        });

        test('resolveModuleSourceFile walks parent directories to find node_modules', function () {
            assert.strictEqual(
                resolvedPath('schema-lib', [
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"type":"module","exports":"./index.js"}'
                    },
                    { filePath: '/project/node_modules/schema-lib/index.js', content: 'export const value = 1;' }
                ], '/project/src/deep/index.ts'),
                '/project/node_modules/schema-lib/index.js'
            );
        });

        test('resolveModuleSourceFile resolves export conditions and fallback module fields', function () {
            assert.strictEqual(
                resolvedPath('condition-lib', [
                    {
                        filePath: '/project/node_modules/condition-lib/package.json',
                        content: '{"type":"module","exports":{".":[{"import":"./esm.js"}]}}'
                    },
                    { filePath: '/project/node_modules/condition-lib/esm.js', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/condition-lib/esm.js'
            );
            assert.strictEqual(
                resolvedPath('module-lib', [
                    {
                        filePath: '/project/node_modules/module-lib/package.json',
                        content: '{"module":"./module.mjs","main":"./main.cjs"}'
                    },
                    { filePath: '/project/node_modules/module-lib/module.mjs', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/module-lib/module.mjs'
            );
            assert.strictEqual(
                resolvedPath('main-lib', [
                    {
                        filePath: '/project/node_modules/main-lib/package.json',
                        content: '{"type":"module","main":"./main.js"}'
                    },
                    { filePath: '/project/node_modules/main-lib/main.js', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/main-lib/main.js'
            );
        });

        test('resolveModuleSourceFile resolves root condition objects without explicit dot entries', function () {
            assert.strictEqual(
                resolvedPath('condition-object-lib', [
                    {
                        filePath: '/project/node_modules/condition-object-lib/package.json',
                        content: '{"type":"module","exports":{"import":"./esm.js","default":"./default.js"}}'
                    },
                    {
                        filePath: '/project/node_modules/condition-object-lib/esm.js',
                        content: 'export const value = 1;'
                    }
                ]),
                '/project/node_modules/condition-object-lib/esm.js'
            );
        });

        test('resolveModuleSourceFile skips invalid condition array entries', function () {
            assert.strictEqual(
                resolvedPath('array-lib', [
                    {
                        filePath: '/project/node_modules/array-lib/package.json',
                        content: '{"type":"module","exports":[null,{"import":"./esm.js"}]}'
                    },
                    { filePath: '/project/node_modules/array-lib/esm.js', content: 'export const value = 1;' }
                ]),
                '/project/node_modules/array-lib/esm.js'
            );
        });

        test('resolveModuleSourceFile resolves relative JavaScript modules', function () {
            assert.strictEqual(
                resolvedPath('./relative', [
                    { filePath: '/project/src/relative.js', content: 'export const value = 1;' }
                ]),
                '/project/src/relative.js'
            );
            assert.strictEqual(
                resolvedPath('./module', [
                    { filePath: '/project/src/module.mjs', content: 'export const value = 1;' }
                ]),
                '/project/src/module.mjs'
            );
        });
    });

    suite('rejected targets', function () {
        test('resolveModuleSourceFile rejects unsupported and unsafe targets', function () {
            assert.strictEqual(
                resolvedPath('#internal', [
                    {
                        filePath: '/project/node_modules/#internal/package.json',
                        content: '{"type":"module","exports":"./index.js"}'
                    },
                    { filePath: '/project/node_modules/#internal/index.js', content: 'export const value = 1;' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('@scope', [
                    {
                        filePath: '/project/node_modules/@scope/undefined/package.json',
                        content: '{"type":"module","exports":"./index.js"}'
                    },
                    { filePath: '/project/node_modules/@scope/undefined/index.js', content: 'export const value = 1;' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('cjs-lib', [
                    { filePath: '/project/node_modules/cjs-lib/package.json', content: '{"main":"./index.js"}' },
                    { filePath: '/project/node_modules/cjs-lib/index.js', content: 'exports.value = 1;' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('js-cjs-lib', [
                    { filePath: '/project/node_modules/js-cjs-lib/package.json', content: '{"exports":"./index.js"}' },
                    { filePath: '/project/node_modules/js-cjs-lib/index.js', content: 'export const value = 1;' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('extension-lib', [
                    {
                        filePath: '/project/node_modules/extension-lib/package.json',
                        content: '{"type":"module","exports":"./index.cjs"}'
                    },
                    { filePath: '/project/node_modules/extension-lib/index.cjs', content: 'exports.value = 1;' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('escape-lib', [
                    {
                        filePath: '/project/node_modules/escape-lib/package.json',
                        content: '{"exports":"../escape.mjs"}'
                    },
                    { filePath: '/project/node_modules/escape.mjs', content: 'export const value = 1;' }
                ]),
                undefined
            );
        });

        test('resolveModuleSourceFile rejects missing and non-string package targets', function () {
            assert.strictEqual(
                resolvedPath('missing-lib', [
                    { filePath: '/project/node_modules/missing-lib/package.json', content: '{"type":"module"}' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('null-lib', [
                    { filePath: '/project/node_modules/null-lib/package.json', content: '{"exports":{".":null}}' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('invalid-manifest-lib', [
                    { filePath: '/project/node_modules/invalid-manifest-lib/package.json', content: 'null' }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('invalid-json-lib', [
                    {
                        filePath: '/project/node_modules/invalid-json-lib/package.json',
                        content: '{"type":"module","exports":"./index.js",'
                    },
                    {
                        filePath: '/project/node_modules/invalid-json-lib/index.js',
                        content: 'export const value = 1;'
                    }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('number-main-lib', [
                    {
                        filePath: '/project/node_modules/number-main-lib/package.json',
                        content: '{"type":"module","main":42}'
                    }
                ]),
                undefined
            );
            assert.strictEqual(
                resolvedPath('main-without-module-type-lib', [
                    {
                        filePath: '/project/node_modules/main-without-module-type-lib/package.json',
                        content: '{"main":"./index.mjs"}'
                    },
                    {
                        filePath: '/project/node_modules/main-without-module-type-lib/index.mjs',
                        content: 'export const value = 1;'
                    }
                ]),
                undefined
            );
        });
    });
});
