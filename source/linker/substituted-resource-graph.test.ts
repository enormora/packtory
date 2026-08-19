import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildLineIndex } from '../dead-code-eliminator/transform/line-index.ts';
import type { SourceMapTransform } from '../dead-code-eliminator/transform/atom-translator.ts';
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

function emptySubstitutedSourceFilePaths(): ReadonlyMap<string, ReadonlySet<string>> {
    return new Map<string, ReadonlySet<string>>();
}

function emptySourceMapTransforms(): ReadonlyMap<string, readonly []> {
    return new Map<string, readonly []>();
}

type DependencyReferenceFixture = {
    readonly name: string;
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

function dependency(name: string): DependencyReferenceFixture {
    return { name, sourceSpecifier: name, emittedSpecifier: name };
}

function sourceMapTransform(marker: number): SourceMapTransform {
    return {
        originalLineIndex: buildLineIndex('a'),
        transformedLineIndex: buildLineIndex('b'),
        atoms: [ { originalStart: 0, originalEnd: 1, newStart: marker } ]
    };
}

suite('substituted-resource-graph', function () {
    test('flatten() deduplicates visited files, merges repeated dependency references, and keeps explicitly included files', function () {
        const graph = createSubstitutedResourceGraph();
        graph.add('/entry.js', {
            fileDescription: createFileDescription('/entry.js', 'entry.js'),
            externalDependencies: [ dependency('left-pad') ],
            bundleDependencies: [ dependency('bundle-dependency') ],
            substitutedSourceFilePathsByPackageName: new Map([ [ 'bundle-dependency', new Set([ '/dep.js' ]) ] ]),
            sourceMapTransformsByTargetPath: emptySourceMapTransforms(),
            isSubstituted: true,
            isExplicitlyIncluded: false
        });
        graph.add('/shared.js', {
            fileDescription: createFileDescription('/shared.js', 'shared.js'),
            externalDependencies: [ dependency('left-pad') ],
            bundleDependencies: [ dependency('bundle-dependency') ],
            substitutedSourceFilePathsByPackageName: new Map([ [ 'bundle-dependency', new Set([ '/other.js' ]) ] ]),
            sourceMapTransformsByTargetPath: emptySourceMapTransforms(),
            isSubstituted: false,
            isExplicitlyIncluded: false
        });
        graph.add('/extra.txt', {
            fileDescription: createFileDescription('/extra.txt', 'extra.txt'),
            externalDependencies: [],
            bundleDependencies: [],
            substitutedSourceFilePathsByPackageName: emptySubstitutedSourceFilePaths(),
            sourceMapTransformsByTargetPath: emptySourceMapTransforms(),
            isSubstituted: false,
            isExplicitlyIncluded: true
        });
        graph.add('/unreachable.txt', {
            fileDescription: createFileDescription('/unreachable.txt', 'unreachable.txt'),
            externalDependencies: [],
            bundleDependencies: [],
            substitutedSourceFilePathsByPackageName: emptySubstitutedSourceFilePaths(),
            sourceMapTransformsByTargetPath: emptySourceMapTransforms(),
            isSubstituted: false,
            isExplicitlyIncluded: false
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
        assert.partialDeepStrictEqual(result, {
            linkedBundleDependencies: new Map([ [ 'bundle-dependency', {
                name: 'bundle-dependency',
                referencedFrom: [ '/entry.js', '/shared.js' ]
            } ] ]),
            substitutedSourceFilePathsByPackageName: new Map([ [
                'bundle-dependency',
                new Set([ '/dep.js', '/other.js' ])
            ] ]),
            externalDependencies: new Map([ [ 'left-pad', {
                name: 'left-pad',
                referencedFrom: [ '/entry.js', '/shared.js' ]
            } ] ])
        });
    });

    test('flatten() preserves the generated-manifest marker on collected resources', function () {
        const graph = createSubstitutedResourceGraph();
        graph.add('/package.json', {
            fileDescription: createFileDescription('/package.json', 'package.json'),
            externalDependencies: [],
            bundleDependencies: [],
            substitutedSourceFilePathsByPackageName: emptySubstitutedSourceFilePaths(),
            sourceMapTransformsByTargetPath: emptySourceMapTransforms(),
            isSubstituted: false,
            isExplicitlyIncluded: false,
            isGeneratedManifest: true
        });

        const result = graph.flatten([ '/package.json' ]);

        assert.strictEqual(result.contents[0]?.isGeneratedManifest, true);
    });

    test('flatten() appends repeated source map transforms for the same target path', function () {
        const graph = createSubstitutedResourceGraph();
        const first = sourceMapTransform(0);
        const second = sourceMapTransform(1);
        graph.add('/entry.js', {
            fileDescription: createFileDescription('/entry.js', 'entry.js'),
            externalDependencies: [],
            bundleDependencies: [],
            substitutedSourceFilePathsByPackageName: emptySubstitutedSourceFilePaths(),
            sourceMapTransformsByTargetPath: new Map([ [ 'shared.js', [ first ] ] ]),
            isSubstituted: false,
            isExplicitlyIncluded: false
        });
        graph.add('/shared.js', {
            fileDescription: createFileDescription('/shared.js', 'shared.js'),
            externalDependencies: [],
            bundleDependencies: [],
            substitutedSourceFilePathsByPackageName: emptySubstitutedSourceFilePaths(),
            sourceMapTransformsByTargetPath: new Map([ [ 'shared.js', [ second ] ] ]),
            isSubstituted: false,
            isExplicitlyIncluded: false
        });
        graph.connect('/entry.js', '/shared.js');

        const result = graph.flatten([ '/entry.js' ]);

        assert.deepStrictEqual(result.sourceMapTransformsByTargetPath.get('shared.js'), [ first, second ]);
    });
});
