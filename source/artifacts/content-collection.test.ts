import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ArtifactSourcePackage } from '../published-package/published-package.ts';
import { collectArtifactContents, describeArtifactsForReport } from './content-collection.ts';

type Content = ArtifactSourcePackage['contents'][number];

function contentEntry(
    targetFilePath: string,
    content: string,
    options: { readonly isSubstituted?: boolean; readonly isExecutable?: boolean } = {}
): Content {
    return {
        isSubstituted: options.isSubstituted ?? false,
        isExplicitlyIncluded: false,
        directDependencies: new Set<string>(),
        fileDescription: {
            content,
            isExecutable: options.isExecutable ?? false,
            sourceFilePath: `/src/${targetFilePath}`,
            targetFilePath
        }
    };
}

function bundle(overrides: Partial<ArtifactSourcePackage> = {}): ArtifactSourcePackage {
    return {
        name: 'pkg-a',
        binField: undefined,
        manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false },
        contents: [],
        ...overrides
    };
}

suite('content-collection', function () {
    test('collectArtifactContents emits just the manifest when the bundle has no contents and no extras', function () {
        assert.deepStrictEqual(collectArtifactContents(bundle(), undefined, []), [
            { filePath: 'package.json', content: '{}', isExecutable: false }
        ]);
    });

    test('collectArtifactContents applies the prefix to the manifest file path', function () {
        assert.deepStrictEqual(collectArtifactContents(bundle(), 'package', []), [
            { filePath: 'package/package.json', content: '{}', isExecutable: false }
        ]);
    });

    test('collectArtifactContents emits bundle contents after the manifest', function () {
        assert.deepStrictEqual(
            collectArtifactContents(bundle({ contents: [contentEntry('a.txt', 'a')] }), undefined, []),
            [
                { filePath: 'package.json', content: '{}', isExecutable: false },
                { filePath: 'a.txt', content: 'a', isExecutable: false }
            ]
        );
    });

    test('collectArtifactContents appends extra files after the bundle contents', function () {
        assert.deepStrictEqual(
            collectArtifactContents(bundle({ contents: [contentEntry('a.txt', 'a')] }), undefined, [
                { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false }
            ]),
            [
                { filePath: 'package.json', content: '{}', isExecutable: false },
                { filePath: 'a.txt', content: 'a', isExecutable: false },
                { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false }
            ]
        );
    });

    test('collectArtifactContents applies the prefix to bundle contents and extra files', function () {
        assert.deepStrictEqual(
            collectArtifactContents(bundle({ contents: [contentEntry('a.txt', 'a')] }), 'package', [
                { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false }
            ]),
            [
                { filePath: 'package/package.json', content: '{}', isExecutable: false },
                { filePath: 'package/a.txt', content: 'a', isExecutable: false },
                { filePath: 'package/sbom.cdx.json', content: '{}', isExecutable: false }
            ]
        );
    });

    test('collectArtifactContents forces explicit bin targets to executable', function () {
        assert.deepStrictEqual(
            collectArtifactContents(
                bundle({
                    contents: [contentEntry('cli.js', '#!/usr/bin/env node')],
                    binField: { 'pkg-a': './cli.js' }
                }),
                undefined,
                []
            ),
            [
                { filePath: 'package.json', content: '{}', isExecutable: false },
                { filePath: 'cli.js', content: '#!/usr/bin/env node', isExecutable: true }
            ]
        );
    });

    test('collectArtifactContents forces a string bin target to executable', function () {
        assert.deepStrictEqual(
            collectArtifactContents(
                bundle({ contents: [contentEntry('cli.js', '#!/usr/bin/env node')], binField: './cli.js' }),
                undefined,
                []
            ),
            [
                { filePath: 'package.json', content: '{}', isExecutable: false },
                { filePath: 'cli.js', content: '#!/usr/bin/env node', isExecutable: true }
            ]
        );
    });

    test('collectArtifactContents ignores non-string bin entries and applies valid ones', function () {
        assert.deepStrictEqual(
            collectArtifactContents(
                bundle({
                    contents: [contentEntry('cli.js', '#!/usr/bin/env node')],
                    binField: { 'pkg-a': './cli.js', broken: 123 as never }
                }),
                undefined,
                []
            ),
            [
                { filePath: 'package.json', content: '{}', isExecutable: false },
                { filePath: 'cli.js', content: '#!/usr/bin/env node', isExecutable: true }
            ]
        );
    });

    test('collectArtifactContents only strips a leading dot-slash from explicit bin targets', function () {
        assert.deepStrictEqual(
            collectArtifactContents(
                bundle({
                    contents: [contentEntry('nested/./cli.js', '#!/usr/bin/env node')],
                    binField: 'nested/./cli.js'
                }),
                undefined,
                []
            ),
            [
                { filePath: 'package.json', content: '{}', isExecutable: false },
                { filePath: 'nested/./cli.js', content: '#!/usr/bin/env node', isExecutable: true }
            ]
        );
    });

    test('describeArtifactsForReport carries sourceFilePath and isSubstituted for bundle entries', function () {
        assert.deepStrictEqual(
            describeArtifactsForReport(
                bundle({ contents: [contentEntry('a.txt', 'a', { isSubstituted: true })] }),
                undefined,
                []
            ),
            [
                { filePath: 'package.json', content: '{}', isExecutable: false },
                {
                    filePath: 'a.txt',
                    content: 'a',
                    isExecutable: false,
                    sourceFilePath: '/src/a.txt',
                    isSubstituted: true
                }
            ]
        );
    });

    test('describeArtifactsForReport applies the prefix to manifest, contents, and extra files', function () {
        assert.deepStrictEqual(
            describeArtifactsForReport(bundle({ contents: [contentEntry('a.txt', 'a')] }), 'package', [
                { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false }
            ]),
            [
                { filePath: 'package/package.json', content: '{}', isExecutable: false },
                {
                    filePath: 'package/a.txt',
                    content: 'a',
                    isExecutable: false,
                    sourceFilePath: '/src/a.txt',
                    isSubstituted: false
                },
                { filePath: 'package/sbom.cdx.json', content: '{}', isExecutable: false }
            ]
        );
    });
});
