import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { inspectWorkspaceImports } from '../inspectors/workspace-imports.ts';
import { compareWorkspaceImports } from './workspace-import-comparison.ts';

suite('workspace import comparison', function () {
    test('explains sibling rewrites and removed imports with deterministic unique references', function () {
        const first = {
            packageName: 'sibling',
            sourcePath: 'index.js',
            sourceSpecifier: '../sibling.js',
            emittedSpecifier: 'sibling/subpath'
        };
        const removed = {
            packageName: 'external',
            sourcePath: 'old.js',
            sourceSpecifier: 'external',
            emittedSpecifier: 'external'
        };
        assert.deepStrictEqual(compareWorkspaceImports([ first, first, removed ], [ first ]), [
            { label: 'external imports', before: 'old.js: external', after: 'no retained import' },
            { label: 'sibling imports', before: 'index.js: ../sibling.js', after: 'index.js: sibling/subpath' }
        ]);
    });

    test('records package and sibling references and excludes local references', function () {
        const contents = [ bundleResource('/source/index.js', {
            moduleReferences: [
                { type: 'external-package', sourceSpecifier: 'pkg', emittedSpecifier: 'pkg', packageName: 'pkg' },
                {
                    type: 'linked-code',
                    sourceSpecifier: '../sibling.js',
                    emittedSpecifier: 'sibling',
                    packageName: 'sibling',
                    targetFilePath: 'index.js'
                },
                {
                    type: 'local-code',
                    sourceSpecifier: './local.js',
                    emittedSpecifier: './local.js',
                    targetFilePath: 'local.js'
                }
            ]
        }) ];
        assert.deepStrictEqual(inspectWorkspaceImports({ contents }), [
            { packageName: 'pkg', sourcePath: 'index.js', sourceSpecifier: 'pkg', emittedSpecifier: 'pkg' },
            {
                packageName: 'sibling',
                sourcePath: 'index.js',
                sourceSpecifier: '../sibling.js',
                emittedSpecifier: 'sibling'
            }
        ]);
    });
});
