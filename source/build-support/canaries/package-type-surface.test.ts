import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { typedExportSpecifiers } from './package-type-surface.ts';

async function typeSurface(
    exports: unknown,
    types: unknown,
    targetFilePath: string,
    declarationExists: boolean
): Promise<readonly string[]> {
    return await typedExportSpecifiers({
        exports,
        types,
        name: 'pkg',
        packageFolder: '/artifact/node_modules/pkg',
        targets: [ { specifier: 'pkg', targetFilePath } ],
        fileManager: createFakeFileManager({
            simulatedCheckReadabilityResponses: [
                { value: { isReadable: declarationExists } },
                { value: { isReadable: false } }
            ]
        })
    });
}

suite('package-type-surface', function () {
    test('includes advertised typings even when the declaration file is missing', async function () {
        assert.deepStrictEqual(
            await typeSurface(
                {
                    '.': { node: { types: './missing.d.ts', import: './index.js' } }
                },
                undefined,
                'index.js',
                false
            ),
            [ 'pkg' ]
        );
        assert.deepStrictEqual(await typeSurface('./index.js', './missing.d.ts', 'index.js', false), [ 'pkg' ]);
        assert.deepStrictEqual(
            await typeSurface(
                {
                    '.': { 'types@>=5.0': './missing.d.ts', import: './index.js' }
                },
                undefined,
                'index.js',
                false
            ),
            [ 'pkg' ]
        );
    });

    test('includes declaration companions for JavaScript module extensions', async function () {
        for (const extension of [ '.js', '.mjs', '.cjs' ]) {
            assert.deepStrictEqual(await typeSurface(`./index${extension}`, undefined, `index${extension}`, true), [
                'pkg'
            ]);
        }
    });

    test('does not impose typings on JavaScript-only exports', async function () {
        assert.deepStrictEqual(await typeSurface({ '.': { import: './index.js' } }, undefined, 'index.js', false), []);
        assert.deepStrictEqual(await typeSurface('./data.json', undefined, 'data.json', false), []);
    });

    test('selects typed subpaths independently of untyped exports', async function () {
        const result = await typedExportSpecifiers({
            name: 'pkg',
            packageFolder: '/artifact/node_modules/pkg',
            types: undefined,
            exports: {
                '.': { import: './index.js' },
                './typed': [ { types: './typed.d.ts', import: './typed.js' } ],
                './plain': { import: './plain.js' }
            },
            targets: [
                { specifier: 'pkg', targetFilePath: 'index.js' },
                { specifier: 'pkg/typed', targetFilePath: 'typed.js' },
                { specifier: 'pkg/plain', targetFilePath: 'plain.js' }
            ],
            fileManager: createFakeFileManager({
                simulatedCheckReadabilityResponses: [
                    { value: { isReadable: false } },
                    { value: { isReadable: false } }
                ]
            })
        });
        assert.deepStrictEqual(result, [ 'pkg/typed' ]);
    });
});
