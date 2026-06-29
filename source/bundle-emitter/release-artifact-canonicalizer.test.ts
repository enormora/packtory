import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFileDescription } from '../file-manager/file-description.ts';
import { canonicalizeReleaseArtifactFiles } from './release-artifact-canonicalizer.ts';

function canonicalizePackageManifest(filePath: string, content: string): string {
    const [ result ] = canonicalizeReleaseArtifactFiles([ createFileDescription(filePath, content) ]);
    if (result === undefined) {
        assert.fail('expected a canonicalized file');
    }
    return result.content;
}

suite('release-artifact-canonicalizer', function () {
    test('removes top-level gitHead from root package manifests', function () {
        assert.strictEqual(
            canonicalizePackageManifest('package.json', '{"name":"pkg","gitHead":"abcdef","version":"1.0.0"}'),
            [ '{', '    "name": "pkg",', '    "version": "1.0.0"', '}' ].join('\n')
        );
    });

    test('removes top-level gitHead from package-prefixed manifests', function () {
        assert.strictEqual(
            canonicalizePackageManifest('package/package.json', '{"name":"pkg","gitHead":"abcdef"}'),
            [ '{', '    "name": "pkg"', '}' ].join('\n')
        );
    });

    test('preserves nested gitHead fields', function () {
        assert.strictEqual(
            canonicalizePackageManifest('package.json', '{"repository":{"gitHead":"abcdef"}}'),
            [ '{', '    "repository": {', '        "gitHead": "abcdef"', '    }', '}' ].join('\n')
        );
    });

    test('leaves malformed manifests unchanged', function () {
        assert.strictEqual(canonicalizePackageManifest('package.json', '{'), '{');
    });

    test('leaves non-object manifests unchanged', function () {
        assert.strictEqual(canonicalizePackageManifest('package.json', '[]'), '[]');
    });

    test('does not rewrite non-manifest files', function () {
        const file = createFileDescription('readme.md', '{"gitHead":"abcdef"}');
        const [ result ] = canonicalizeReleaseArtifactFiles([ file ]);

        assert.strictEqual(result, file);
    });
});
