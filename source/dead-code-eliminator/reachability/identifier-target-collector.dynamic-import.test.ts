import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { buildDeclarationNodeIndex } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';

suite('identifier-target-collector dynamic import', function () {
    for (
        const expression of [
            'import("./dep.js")',
            'import("external")',
            'import(specifier)',
            'import()',
            'consume("./dep.js")'
        ]
    ) {
        test(`collects local exports only for ${expression}`, function () {
            const files = multiFileBindingsFor([
                { filePath: '/source/index.js', content: `export function probe() { return ${expression}; }` },
                { filePath: '/source/dep.js', content: 'export const value = 1;\nexport default 9;\nconst unused = 0;' }
            ]);
            const [ entry ] = files;
            assertDefined(entry);
            assert.deepStrictEqual(
                collectIdentifierTargets(
                    entry.sourceFile.getFunctionOrThrow('probe'),
                    buildDeclarationNodeIndex(files),
                    undefined
                ),
                new Set([
                    '/source/index.js::probe',
                    ...expression === 'import("./dep.js")' ? [ '/source/dep.js::value', '/source/dep.js::default' ] : []
                ])
            );
        });
    }

    test('ignores ordinary calls even when their argument has module reference metadata', function () {
        const files = multiFileBindingsFor([
            {
                filePath: '/source/index.js',
                content: [
                    'export function probe() { return consume("./dep.js"); }',
                    'function load() { return import("./dep.js"); }'
                ]
                    .join('\n')
            },
            { filePath: '/source/dep.js', content: 'export const value = 1;' }
        ]);
        const [ entry ] = files;
        assertDefined(entry);
        assert.deepStrictEqual(
            collectIdentifierTargets(
                entry.sourceFile.getFunctionOrThrow('probe'),
                buildDeclarationNodeIndex(files),
                undefined
            ),
            new Set([ '/source/index.js::probe' ])
        );
    });

    test('resolves emitted specifiers through artifact metadata', function () {
        const files = multiFileBindingsFor([
            { filePath: '/source/index.js', content: 'export function probe() { return import("#lazy"); }' },
            { filePath: '/source/dep.js', content: 'export const value = 1;' }
        ])
            .map(function (file) {
                return file.targetFilePath === '/source/index.js'
                    ? {
                        ...file,
                        moduleReferences: [ {
                            type: 'local-code' as const,
                            sourceSpecifier: '#original',
                            emittedSpecifier: '#lazy',
                            targetFilePath: '/source/dep.js'
                        } ]
                    }
                    : file;
            });
        const [ entry ] = files;
        assertDefined(entry);
        assert.deepStrictEqual(
            collectIdentifierTargets(
                entry.sourceFile.getFunctionOrThrow('probe'),
                buildDeclarationNodeIndex(files),
                undefined
            ),
            new Set([ '/source/index.js::probe', '/source/dep.js::value' ])
        );
    });

    for (const omitted of [ 'importer', 'references', 'target' ]) {
        test(`ignores dynamic imports without indexed ${omitted}`, function () {
            const files = multiFileBindingsFor([
                { filePath: '/source/index.js', content: 'export function probe() { return import("./dep.js"); }' },
                { filePath: '/source/dep.js', content: 'export const value = 1;' }
            ]);
            const [ entry ] = files;
            assertDefined(entry);
            const index = buildDeclarationNodeIndex(files);
            const paths = new Map(index.targetFilePathByInputFilePath);
            if (omitted !== 'references') {
                paths.delete(omitted === 'importer' ? '/source/index.js' : '/source/dep.js');
            }
            assert.deepStrictEqual(
                collectIdentifierTargets(entry.sourceFile.getFunctionOrThrow('probe'), {
                    ...index,
                    targetFilePathByInputFilePath: paths,
                    moduleReferencesByTargetFilePath: omitted === 'references'
                        ? new Map()
                        : index.moduleReferencesByTargetFilePath
                }, undefined),
                new Set([ '/source/index.js::probe' ])
            );
        });
    }

    test('preserves conflicting star exports through cyclic barrels', function () {
        const files = multiFileBindingsFor([
            { filePath: '/source/index.js', content: 'export function probe() { return import("./barrel.js"); }' },
            { filePath: '/source/barrel.js', content: 'export * from "./a.js"; export * from "./b.js";' },
            { filePath: '/source/a.js', content: 'export * from "./barrel.js"; export const clash = 1;' },
            { filePath: '/source/b.js', content: 'export const clash = 2; export default 9;' }
        ]);
        const [ entry ] = files;
        assertDefined(entry);
        assert.deepStrictEqual(
            collectIdentifierTargets(
                entry.sourceFile.getFunctionOrThrow('probe'),
                buildDeclarationNodeIndex(files),
                undefined
            ),
            new Set([ '/source/index.js::probe', '/source/a.js::clash', '/source/b.js::clash' ])
        );
    });
});
