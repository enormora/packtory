import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Project } from 'ts-morph';
import {
    createDeclarationIntegritySummarizer,
    type DeclarationMode
} from '../../source/checks/rules/type-script-declaration-integrity.ts';
import { createDeclarationProjectFactory } from '../../source/checks/rules/type-script-declaration-project.ts';
import { manifest, publishedPackage } from './published-package-fixtures.ts';

const summarizeDeclarationIntegrity = createDeclarationIntegritySummarizer({
    createDeclarationProjects: createDeclarationProjectFactory({ Project })
});

function checkDeclarations(
    packageName: string,
    manifestFields: Readonly<Record<string, unknown>>,
    files: Readonly<Record<string, string>>,
    declarationMode: DeclarationMode
): readonly string[] {
    return summarizeDeclarationIntegrity(
        packageName,
        publishedPackage(packageName, manifest(packageName, manifestFields), {
            'index.js': 'export const value = 1;\n',
            ...files
        }),
        declarationMode
    );
}

suite('declaration integrity against the real TypeScript compiler', function () {
    test('reports a missing export of a checked declaration for both compiler modes', function () {
        const issues = checkDeclarations(
            'missing-export',
            { types: './index.d.ts' },
            {
                'index.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                'internal.d.ts': 'export declare const present: string;\n'
            },
            'all'
        );

        assert.deepStrictEqual(issues, [
            'Package "missing-export" failed TypeScript integrity in node16-esm: index.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'.",
            'Package "missing-export" failed TypeScript integrity in bundler: index.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'."
        ]);
    });

    test('checks declarations no export reaches in the "all" mode', function () {
        const issues = checkDeclarations(
            'private-declaration',
            { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
            {
                'index.d.ts': 'export declare const value: number;\n',
                'private.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                'internal.d.ts': 'export declare const present: string;\n'
            },
            'all'
        );

        assert.deepStrictEqual(issues, [
            'Package "private-declaration" failed TypeScript integrity in node16-esm: private.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'.",
            'Package "private-declaration" failed TypeScript integrity in bundler: private.d.ts:1 TS2305: ' +
            "Module '\"./internal.js\"' has no exported member 'Missing'."
        ]);
    });

    test('ignores declarations no export reaches in the "exports-graph" mode', function () {
        const issues = checkDeclarations(
            'private-declaration',
            { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
            {
                'index.d.ts': 'export declare const value: number;\n',
                'private.d.ts': 'import { Missing } from "./internal.js";\nexport declare const value: Missing;\n',
                'internal.d.ts': 'export declare const present: string;\n'
            },
            'exports-graph'
        );

        assert.deepStrictEqual(issues, []);
    });

    test('follows declaration imports through known JavaScript extensions', function () {
        const issues = checkDeclarations(
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
            'Package "known-extensions" failed TypeScript integrity in node16-esm: common.d.cts:1 TS2305: ' +
            "Module '\"./leaf.js\"' has no exported member 'Missing'.",
            'Package "known-extensions" failed TypeScript integrity in node16-esm: esm.d.mts:1 TS2305: ' +
            "Module '\"./leaf.js\"' has no exported member 'Missing'.",
            'Package "known-extensions" failed TypeScript integrity in bundler: common.d.cts:1 TS2305: ' +
            "Module '\"./leaf.js\"' has no exported member 'Missing'.",
            'Package "known-extensions" failed TypeScript integrity in bundler: esm.d.mts:1 TS2305: ' +
            "Module '\"./leaf.js\"' has no exported member 'Missing'."
        ]);
    });

    test('follows extensionless and index declaration imports', function () {
        const issues = checkDeclarations(
            'extensionless',
            { exports: { '.': { types: './index.d.ts', import: './index.js' } } },
            {
                'index.d.ts': [
                    'import { Plain } from "./plain";',
                    'import { Folder } from "./folder";',
                    'export declare const value: Folder | Plain;'
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
                'leaf.d.ts': 'export declare const present: string;\n'
            },
            'exports-graph'
        );

        assert.deepStrictEqual(issues, [
            'Package "extensionless" failed TypeScript integrity in node16-esm: folder/index.d.ts:1 TS2305: ' +
            "Module '\"../leaf.js\"' has no exported member 'Missing'.",
            'Package "extensionless" failed TypeScript integrity in node16-esm: plain.d.ts:1 TS2305: ' +
            "Module '\"./leaf.js\"' has no exported member 'Missing'.",
            'Package "extensionless" failed TypeScript integrity in bundler: folder/index.d.ts:1 TS2305: ' +
            "Module '\"../leaf.js\"' has no exported member 'Missing'.",
            'Package "extensionless" failed TypeScript integrity in bundler: plain.d.ts:1 TS2305: ' +
            "Module '\"./leaf.js\"' has no exported member 'Missing'."
        ]);
    });

    test('follows cyclic declaration imports once', function () {
        const issues = checkDeclarations(
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
            'Package "cyclic-declarations" failed TypeScript integrity in node16-esm: leaf.d.ts:1 TS2305: ' +
            "Module '\"./index.js\"' has no exported member 'Root'.",
            'Package "cyclic-declarations" failed TypeScript integrity in bundler: leaf.d.ts:1 TS2305: ' +
            "Module '\"./index.js\"' has no exported member 'Root'."
        ]);
    });

    test('reports a diagnostic message chain without flattening away its line breaks', function () {
        const issues = checkDeclarations(
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
                'Package "diagnostic-chain" failed TypeScript integrity in node16-esm: index.d.ts:2 TS2430: ' +
                "Interface 'B' incorrectly extends interface 'A'.",
                "  Types of property 'value' are incompatible.",
                "    Type 'number' is not assignable to type 'string'."
            ]
                .join('\n'),
            [
                'Package "diagnostic-chain" failed TypeScript integrity in bundler: index.d.ts:2 TS2430: ' +
                "Interface 'B' incorrectly extends interface 'A'.",
                "  Types of property 'value' are incompatible.",
                "    Type 'number' is not assignable to type 'string'."
            ]
                .join('\n')
        ]);
    });
});
