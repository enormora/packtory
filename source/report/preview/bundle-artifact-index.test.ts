import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import { buildBundleArtifactIndex } from './bundle-artifact-index.ts';

function buildResult(
    name: string,
    manifestContent: string,
    contents: readonly {
        readonly inputFilePath: string;
        readonly targetFilePath: string;
        readonly content: string;
    }[] = []
): BuildAndPublishResult {
    return {
        bundle: {
            name,
            manifestFile: { filePath: 'package.json', content: manifestContent, isExecutable: false },
            contents: contents.map(function (entry) {
                return {
                    fileDescription: {
                        inputFilePath: entry.inputFilePath,
                        targetFilePath: entry.targetFilePath,
                        content: entry.content,
                        isExecutable: false
                    }
                };
            })
        }
    } as unknown as BuildAndPublishResult;
}

suite('bundle-artifact-index', function () {
    test('buildBundleArtifactIndex returns an empty map when given no results', function () {
        assert.strictEqual(buildBundleArtifactIndex([]).size, 0);
    });

    test('buildBundleArtifactIndex always seeds an entry for package.json from the manifest content', function () {
        const index = buildBundleArtifactIndex([ buildResult('package-a', '{"name":"package-a"}') ]);

        assert.deepStrictEqual(index.get('package-a')?.get('package.json'), { content: '{"name":"package-a"}' });
    });

    test('buildBundleArtifactIndex includes each bundle content entry keyed by target file path', function () {
        const index = buildBundleArtifactIndex([
            buildResult('package-a', '{}', [ {
                inputFilePath: '/source/a.ts',
                targetFilePath: 'a.js',
                content: 'content-a'
            } ])
        ]);

        assert.deepStrictEqual(index.get('package-a')?.get('a.js'), {
            content: 'content-a',
            sourcePath: '/source/a.ts'
        });
    });

    test('buildBundleArtifactIndex maps each bundle to its own inner index by package name', function () {
        const index = buildBundleArtifactIndex([ buildResult('package-a', '{}'), buildResult('package-b', '{}') ]);

        assert.notStrictEqual(index.get('package-a'), index.get('package-b'));
        assert.strictEqual(index.has('package-a'), true);
        assert.strictEqual(index.has('package-b'), true);
    });
});
