import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import { summarizeDeclarationIntegrity, type DeclarationMode } from './type-script-declaration-integrity.ts';

const declarationCheckTestTimeoutMs = 60_000;

function createPublishedPackage(
    packageName: string,
    manifestContent: string,
    files: Readonly<Record<string, string>>
): PublishedPackageWithManifest {
    return {
        name: packageName,
        version: '0.0.0',
        manifestFile: {
            filePath: 'package.json',
            content: manifestContent,
            isExecutable: false
        },
        contents: Object
            .entries(files)
            .map(function ([ filePath, content ]) {
                return {
                    directDependencies: new Set<string>(),
                    fileDescription: {
                        sourceFilePath: filePath,
                        targetFilePath: filePath,
                        content,
                        isExecutable: false
                    },
                    isExplicitlyIncluded: false,
                    isSubstituted: false
                };
            })
    } as unknown as PublishedPackageWithManifest;
}

function createManifest(packageName: string, fields: Readonly<Record<string, unknown>>): string {
    return JSON.stringify({
        name: packageName,
        version: '0.0.0',
        type: 'module',
        ...fields
    });
}

function packageWithManifest(
    packageName: string,
    fields: Readonly<Record<string, unknown>>,
    declarations: Readonly<Record<string, string>>
): PublishedPackageWithManifest {
    return createPublishedPackage(
        packageName,
        createManifest(packageName, fields),
        {
            'index.js': 'export const value = 1;\n',
            ...declarations
        }
    );
}

function runDeclarationCheck(
    packageName: string,
    fields: Readonly<Record<string, unknown>>,
    declarations: Readonly<Record<string, string>>,
    mode: DeclarationMode
): readonly string[] {
    return summarizeDeclarationIntegrity(
        packageName,
        packageWithManifest(packageName, fields, declarations),
        mode
    );
}

suite('type-script-declaration-integrity', function () {
    suite('exports graph paths', function () {
        test('exports-graph follows top-level types', function () {
            const issues = runDeclarationCheck(
                'top-level-types',
                { types: './index.d.ts' },
                {
                    'index.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                    'internal.d.ts': 'export declare const present: string;\n'
                },
                'exports-graph'
            );

            assert.deepStrictEqual(issues, [
                'Package "top-level-types" failed TypeScript integrity in node16-esm: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.',
                'Package "top-level-types" failed TypeScript integrity in bundler: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.'
            ]);
        })
            .timeout(declarationCheckTestTimeoutMs);

        test('exports-graph follows top-level types without a relative prefix', function () {
            const issues = runDeclarationCheck(
                'bare-top-level-types',
                { types: 'index.d.ts' },
                {
                    'index.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                    'internal.d.ts': 'export declare const present: string;\n'
                },
                'exports-graph'
            );

            assert.deepStrictEqual(issues, [
                'Package "bare-top-level-types" failed TypeScript integrity in node16-esm: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.',
                'Package "bare-top-level-types" failed TypeScript integrity in bundler: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.'
            ]);
        })
            .timeout(declarationCheckTestTimeoutMs);

        test('exports-graph follows nested typings arrays and ignores non-type branches', function () {
            const issues = runDeclarationCheck(
                'nested-typings',
                {
                    exports: {
                        '.': [
                            { import: './index.js' },
                            { typings: './index.d.ts' },
                            './index.js'
                        ]
                    }
                },
                {
                    'index.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                    'internal.d.ts': 'export declare const present: string;\n',
                    'private.d.ts': [
                        'import { AlsoMissing } from "./internal.js";',
                        'export declare const value: AlsoMissing;'
                    ]
                        .join('\n')
                },
                'exports-graph'
            );

            assert.deepStrictEqual(issues, [
                'Package "nested-typings" failed TypeScript integrity in node16-esm: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.',
                'Package "nested-typings" failed TypeScript integrity in bundler: index.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.'
            ]);
        })
            .timeout(declarationCheckTestTimeoutMs);

        test('exports-graph follows declaration imports through known JavaScript extensions', function () {
            const issues = runDeclarationCheck(
                'known-extensions',
                { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
                {
                    'index.d.ts': [
                        'import { E } from "./esm.mjs";',
                        'import { C } from "./common.cjs";',
                        'export declare const value: E | C;'
                    ]
                        .join('\n'),
                    'esm.d.mts': [
                        'import { Missing } from "./leaf.js";',
                        'export declare const value: Missing;',
                        'export type E = string;'
                    ]
                        .join('\n'),
                    'common.d.cts': [
                        'import { Missing } from "./leaf.js";',
                        'export declare const value: Missing;',
                        'export type C = string;'
                    ]
                        .join('\n'),
                    'leaf.d.ts': 'export declare const present: string;\n'
                },
                'exports-graph'
            );

            assert.deepStrictEqual(issues, [
                'Package "known-extensions" failed TypeScript integrity in node16-esm: common.d.cts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "known-extensions" failed TypeScript integrity in node16-esm: esm.d.mts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "known-extensions" failed TypeScript integrity in bundler: common.d.cts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "known-extensions" failed TypeScript integrity in bundler: esm.d.mts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.'
            ]);
        })
            .timeout(declarationCheckTestTimeoutMs);

        test('exports-graph follows extensionless and index declaration imports', function () {
            const issues = runDeclarationCheck(
                'extensionless',
                { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
                {
                    'index.d.ts': [
                        'import { Plain } from "./plain";',
                        'import { Folder } from "./folder";',
                        'import { EsmDeclaration } from "./module-a";',
                        'import { CommonJsDeclaration } from "./module-b";',
                        'export declare const value: Plain | Folder | EsmDeclaration | CommonJsDeclaration;'
                    ]
                        .join('\n'),
                    'plain.d.ts': [
                        'import { Missing } from "./leaf.js";',
                        'export type Plain = Missing;'
                    ]
                        .join('\n'),
                    'folder/index.d.ts': [
                        'import { Missing } from "../leaf.js";',
                        'export type Folder = Missing;'
                    ]
                        .join('\n'),
                    'module-a.d.mts': [
                        'import { Missing } from "./leaf.js";',
                        'export type EsmDeclaration = Missing;'
                    ]
                        .join('\n'),
                    'module-b.d.cts': [
                        'import { Missing } from "./leaf.js";',
                        'export type CommonJsDeclaration = Missing;'
                    ]
                        .join('\n'),
                    'leaf.d.ts': 'export declare const present: string;\n'
                },
                'exports-graph'
            );

            assert.deepStrictEqual(issues, [
                'Package "extensionless" failed TypeScript integrity in node16-esm: folder/index.d.ts:1 TS2305: Module \'"../leaf.js"\' has no exported member \'Missing\'.',
                'Package "extensionless" failed TypeScript integrity in node16-esm: index.d.ts:3 TS2307: Cannot find module \'./module-a\' or its corresponding type declarations.',
                'Package "extensionless" failed TypeScript integrity in node16-esm: index.d.ts:4 TS2307: Cannot find module \'./module-b\' or its corresponding type declarations.',
                'Package "extensionless" failed TypeScript integrity in node16-esm: module-a.d.mts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "extensionless" failed TypeScript integrity in node16-esm: module-b.d.cts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "extensionless" failed TypeScript integrity in node16-esm: plain.d.ts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "extensionless" failed TypeScript integrity in bundler: folder/index.d.ts:1 TS2305: Module \'"../leaf.js"\' has no exported member \'Missing\'.',
                'Package "extensionless" failed TypeScript integrity in bundler: index.d.ts:3 TS2307: Cannot find module \'./module-a\' or its corresponding type declarations.',
                'Package "extensionless" failed TypeScript integrity in bundler: index.d.ts:4 TS2307: Cannot find module \'./module-b\' or its corresponding type declarations.',
                'Package "extensionless" failed TypeScript integrity in bundler: module-a.d.mts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "extensionless" failed TypeScript integrity in bundler: module-b.d.cts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.',
                'Package "extensionless" failed TypeScript integrity in bundler: plain.d.ts:1 TS2305: Module \'"./leaf.js"\' has no exported member \'Missing\'.'
            ]);
        })
            .timeout(declarationCheckTestTimeoutMs);

        test('exports-graph ignores non-relative declaration imports', function () {
            const issues = runDeclarationCheck(
                'external-import',
                { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
                {
                    'index.d.ts': 'import { External } from "external";\nexport { External };\n',
                    'external.d.ts': [
                        'declare module "external" {',
                        '    export type External = Missing;',
                        '}'
                    ]
                        .join('\n')
                },
                'exports-graph'
            );

            assert.deepStrictEqual(issues, []);
        })
            .timeout(declarationCheckTestTimeoutMs);

        test('exports-graph ignores missing declaration roots', function () {
            const issues = runDeclarationCheck(
                'missing-root',
                { exports: { '.': { types: './missing.d.ts', import: './index.js' } } },
                {
                    'private.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                    'internal.d.ts': 'export declare const present: string;\n'
                },
                'exports-graph'
            );

            assert.deepStrictEqual(issues, []);
        })
            .timeout(declarationCheckTestTimeoutMs);
    });

    test('reports multiline TypeScript diagnostics without flattening away line breaks', function () {
        const issues = runDeclarationCheck(
            'diagnostic-chain',
            { types: './index.d.ts' },
            {
                'index.d.ts': [
                    'export interface A { value: string; }',
                    'export interface B extends A { value: number; }'
                ]
                    .join('\n')
            },
            'exports-graph'
        );

        assert.deepStrictEqual(issues, [
            [
                "Package \"diagnostic-chain\" failed TypeScript integrity in node16-esm: index.d.ts:2 TS2430: Interface 'B' incorrectly extends interface 'A'.",
                "  Types of property 'value' are incompatible.",
                "    Type 'number' is not assignable to type 'string'."
            ]
                .join('\n'),
            [
                "Package \"diagnostic-chain\" failed TypeScript integrity in bundler: index.d.ts:2 TS2430: Interface 'B' incorrectly extends interface 'A'.",
                "  Types of property 'value' are incompatible.",
                "    Type 'number' is not assignable to type 'string'."
            ]
                .join('\n')
        ]);
    })
        .timeout(declarationCheckTestTimeoutMs);

    test('exports-graph follows parent-relative declaration imports', function () {
        const issues = runDeclarationCheck(
            'parent-relative',
            { exports: { '.': { types: './folder/index.d.ts', import: './index.js' } } },
            {
                'folder/index.d.ts': 'import { Present } from "../leaf.js";\nexport declare const value: Present;\n',
                'leaf.d.ts': 'import { Missing } from "./internal.js";\nexport type Present = Missing;\n',
                'internal.d.ts': 'export declare const present: string;\n'
            },
            'exports-graph'
        );

        assert.deepStrictEqual(issues, [
            'Package "parent-relative" failed TypeScript integrity in node16-esm: leaf.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.',
            'Package "parent-relative" failed TypeScript integrity in bundler: leaf.d.ts:1 TS2305: Module \'"./internal.js"\' has no exported member \'Missing\'.'
        ]);
    })
        .timeout(declarationCheckTestTimeoutMs);

    test('exports-graph follows cyclic declaration imports once', function () {
        const issues = runDeclarationCheck(
            'cyclic-declarations',
            { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
            {
                'index.d.ts': 'import { Leaf } from "./leaf.js";\nexport declare const value: Leaf;\n',
                'leaf.d.ts':
                    'import { Root } from "./index.js";\nexport type Leaf = Root;\nexport type Root = string;\n'
            },
            'exports-graph'
        );

        assert.deepStrictEqual(issues, [
            'Package "cyclic-declarations" failed TypeScript integrity in node16-esm: leaf.d.ts:1 TS2305: Module \'"./index.js"\' has no exported member \'Root\'.',
            'Package "cyclic-declarations" failed TypeScript integrity in bundler: leaf.d.ts:1 TS2305: Module \'"./index.js"\' has no exported member \'Root\'.'
        ]);
    })
        .timeout(declarationCheckTestTimeoutMs);

    test('exports-graph follows index declaration variants', function () {
        const issues = runDeclarationCheck(
            'index-variants',
            { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
            {
                'index.d.ts': [
                    'import { EsmFolder } from "./esm-folder";',
                    'import { CommonJsFolder } from "./common-js-folder";',
                    'export declare const value: EsmFolder | CommonJsFolder;'
                ]
                    .join('\n'),
                'esm-folder/index.d.mts': [
                    'import { Missing } from "../internal.js";',
                    'export type EsmFolder = Missing;'
                ]
                    .join('\n'),
                'common-js-folder/index.d.cts': [
                    'import { Missing } from "../internal.js";',
                    'export type CommonJsFolder = Missing;'
                ]
                    .join('\n'),
                'internal.d.ts': 'export declare const present: string;\n'
            },
            'exports-graph'
        );

        assert.deepStrictEqual(issues, [
            'Package "index-variants" failed TypeScript integrity in node16-esm: common-js-folder/index.d.cts:1 TS2305: Module \'"../internal.js"\' has no exported member \'Missing\'.',
            'Package "index-variants" failed TypeScript integrity in node16-esm: esm-folder/index.d.mts:1 TS2305: Module \'"../internal.js"\' has no exported member \'Missing\'.',
            'Package "index-variants" failed TypeScript integrity in node16-esm: index.d.ts:1 TS2307: Cannot find module \'./esm-folder\' or its corresponding type declarations.',
            'Package "index-variants" failed TypeScript integrity in node16-esm: index.d.ts:2 TS2307: Cannot find module \'./common-js-folder\' or its corresponding type declarations.',
            'Package "index-variants" failed TypeScript integrity in bundler: common-js-folder/index.d.cts:1 TS2305: Module \'"../internal.js"\' has no exported member \'Missing\'.',
            'Package "index-variants" failed TypeScript integrity in bundler: esm-folder/index.d.mts:1 TS2305: Module \'"../internal.js"\' has no exported member \'Missing\'.',
            'Package "index-variants" failed TypeScript integrity in bundler: index.d.ts:1 TS2307: Cannot find module \'./esm-folder\' or its corresponding type declarations.',
            'Package "index-variants" failed TypeScript integrity in bundler: index.d.ts:2 TS2307: Cannot find module \'./common-js-folder\' or its corresponding type declarations.'
        ]);
    })
        .timeout(declarationCheckTestTimeoutMs);

    test('exports-graph ignores malformed manifests because they expose no declaration roots', function () {
        const packageName = 'malformed-manifest';
        const issues = summarizeDeclarationIntegrity(
            packageName,
            createPublishedPackage(
                packageName,
                'null',
                {
                    'index.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                    'internal.d.ts': 'export declare const present: string;\n'
                }
            ),
            'exports-graph'
        );

        assert.deepStrictEqual(issues, []);
    })
        .timeout(declarationCheckTestTimeoutMs);
});
