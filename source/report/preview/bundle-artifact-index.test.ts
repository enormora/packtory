import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { BuildAndPublishResult } from '../../packtory/package-processor.ts';
import { buildBundleArtifactIndex } from './bundle-artifact-index.ts';

function buildResult(
    name: string,
    manifestContent: string,
    contents: readonly {
        readonly sourceFilePath: string;
        readonly targetFilePath: string;
        readonly content: string;
    }[] = []
): BuildAndPublishResult {
    return {
        bundle: {
            name,
            manifestFile: { filePath: 'package.json', content: manifestContent, isExecutable: false },
            contents: contents.map((entry) => {
                return {
                    fileDescription: {
                        sourceFilePath: entry.sourceFilePath,
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
        const index = buildBundleArtifactIndex([buildResult('pkg-a', '{"name":"pkg-a"}')]);

        assert.deepStrictEqual(index.get('pkg-a')?.get('package.json'), { content: '{"name":"pkg-a"}' });
    });

    test('buildBundleArtifactIndex includes each bundle content entry keyed by target file path', function () {
        const index = buildBundleArtifactIndex([
            buildResult('pkg-a', '{}', [{ sourceFilePath: '/src/a.ts', targetFilePath: 'a.js', content: 'content-a' }])
        ]);

        assert.deepStrictEqual(index.get('pkg-a')?.get('a.js'), { content: 'content-a', sourcePath: '/src/a.ts' });
    });

    test('buildBundleArtifactIndex maps each bundle to its own inner index by package name', function () {
        const index = buildBundleArtifactIndex([buildResult('pkg-a', '{}'), buildResult('pkg-b', '{}')]);

        assert.strictEqual(index.get('pkg-a') === index.get('pkg-b'), false);
        assert.strictEqual(index.has('pkg-a'), true);
        assert.strictEqual(index.has('pkg-b'), true);
    });
});
