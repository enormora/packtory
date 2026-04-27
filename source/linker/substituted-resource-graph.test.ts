/* eslint-disable @typescript-eslint/explicit-function-return-type -- small local test fixtures stay clearer without repetitive annotations */
import assert from 'node:assert';
import { test } from 'mocha';
import { createSubstitutedResourceGraph } from './substituted-resource-graph.ts';

function createFileDescription(sourceFilePath: string, targetFilePath = sourceFilePath.slice(1)) {
    return {
        sourceFilePath,
        targetFilePath,
        content: '',
        isExecutable: false
    };
}

test('flatten() deduplicates visited files, merges repeated dependency references, and keeps explicitly included files', () => {
    const graph = createSubstitutedResourceGraph();
    graph.add('/entry.js', {
        fileDescription: createFileDescription('/entry.js', 'entry.js'),
        externalDependencies: ['left-pad'],
        bundleDependencies: ['bundle-dependency'],
        isSubstituted: true,
        isExplicitlyIncluded: false
    });
    graph.add('/shared.js', {
        fileDescription: createFileDescription('/shared.js', 'shared.js'),
        externalDependencies: ['left-pad'],
        bundleDependencies: ['bundle-dependency'],
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

    const result = graph.flatten(['/entry.js', '/shared.js']);

    assert.deepStrictEqual(
        result.contents
            .map((resource) => {
                return resource.fileDescription.sourceFilePath;
            })
            .toSorted((left, right) => {
                return left.localeCompare(right);
            }),
        ['/entry.js', '/extra.txt', '/shared.js']
    );
    assert.deepStrictEqual(
        result.linkedBundleDependencies,
        new Map([['bundle-dependency', { name: 'bundle-dependency', referencedFrom: ['/entry.js', '/shared.js'] }]])
    );
    assert.deepStrictEqual(
        result.externalDependencies,
        new Map([['left-pad', { name: 'left-pad', referencedFrom: ['/entry.js', '/shared.js'] }]])
    );
});
