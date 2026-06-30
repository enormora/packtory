import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { TransferableFileDescription } from '../file-manager/file-description.ts';
import { createSubstitutedResourceGraph } from './substituted-resource-graph.ts';

function createFileDescription(
    sourceFilePath: string,
    targetFilePath = sourceFilePath.slice(1)
): TransferableFileDescription {
    return {
        sourceFilePath,
        targetFilePath,
        content: '',
        isExecutable: false
    };
}

suite('substituted-resource-graph', function () {
    test('flatten() deduplicates visited files, merges repeated dependency references, and keeps explicitly included files', function () {
        const graph = createSubstitutedResourceGraph();
        graph.add('/entry.js', {
            fileDescription: createFileDescription('/entry.js', 'entry.js'),
            externalDependencies: [ 'left-pad' ],
            bundleDependencies: [ 'bundle-dependency' ],
            isSubstituted: true,
            isExplicitlyIncluded: false
        });
        graph.add('/shared.js', {
            fileDescription: createFileDescription('/shared.js', 'shared.js'),
            externalDependencies: [ 'left-pad' ],
            bundleDependencies: [ 'bundle-dependency' ],
            isSubstituted: false,
            isExplicitlyIncluded: false
        });
        graph.add('/extra.txt', {
            fileDescription: createFileDescription('/extra.txt', 'extra.txt'),
            externalDependencies: [],
            bundleDependencies: [],
            isSubstituted: false,
            isExplicitlyIncluded: true
        });
        graph.connect('/entry.js', '/shared.js');
        graph.connect('/shared.js', '/entry.js');

        const result = graph.flatten([ '/entry.js', '/shared.js' ]);

        assert.deepStrictEqual(
            result
                .contents
                .map(function (resource) {
                    return resource.fileDescription.sourceFilePath;
                })
                .toSorted(function (left, right) {
                    return left.localeCompare(right);
                }),
            [ '/entry.js', '/extra.txt', '/shared.js' ]
        );
        assert.deepStrictEqual(
            result.linkedBundleDependencies,
            new Map([ [ 'bundle-dependency', {
                name: 'bundle-dependency',
                referencedFrom: [ '/entry.js', '/shared.js' ]
            } ] ])
        );
        assert.deepStrictEqual(
            result.externalDependencies,
            new Map([ [ 'left-pad', { name: 'left-pad', referencedFrom: [ '/entry.js', '/shared.js' ] } ] ])
        );
    });

    test('flatten() preserves the generated-manifest marker on collected resources', function () {
        const graph = createSubstitutedResourceGraph();
        graph.add('/package.json', {
            fileDescription: createFileDescription('/package.json', 'package.json'),
            externalDependencies: [],
            bundleDependencies: [],
            isSubstituted: false,
            isExplicitlyIncluded: false,
            isGeneratedManifest: true
        });

        const result = graph.flatten([ '/package.json' ]);

        assert.strictEqual(result.contents[0]?.isGeneratedManifest, true);
    });
});
