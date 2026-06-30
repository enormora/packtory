import assert from 'node:assert';
import { suite, test } from 'mocha';
import { collectReleaseOutputFiles } from './release-output-files.ts';

suite('release-output-files', function () {
    test('returns no files when changelog outputs are not configured', function () {
        assert.deepStrictEqual(
            collectReleaseOutputFiles({
                workingDirectory: '/repo',
                config: { packages: [ { name: 'pkg-a' } ] }
            }),
            []
        );
    });

    test('collects repository and package changelog outputs as release files', function () {
        assert.deepStrictEqual(
            collectReleaseOutputFiles({
                workingDirectory: '/repo',
                config: {
                    changelog: {
                        outputs: [
                            { kind: 'repository-file', path: 'CHANGELOG.md' },
                            { kind: 'package-file', path: 'docs/CHANGELOG.md' },
                            { kind: 'github-release' }
                        ]
                    },
                    commonPackageSettings: { sourcesFolder: 'packages' },
                    packages: [ { name: 'pkg-a' }, { name: 'pkg-b', sourcesFolder: 'other/pkg-b' } ]
                }
            }),
            [ 'CHANGELOG.md', 'packages/docs/CHANGELOG.md', 'other/pkg-b/docs/CHANGELOG.md' ]
        );
    });

    test('collects explicit package changelog outputs', function () {
        assert.deepStrictEqual(
            collectReleaseOutputFiles({
                workingDirectory: '/repo',
                config: {
                    changelog: {
                        outputs: [
                            {
                                kind: 'package-file',
                                paths: {
                                    'pkg-a': 'source/pkg-a/CHANGELOG.md',
                                    'pkg-b': 'source/pkg-b/CHANGELOG.md'
                                }
                            }
                        ]
                    },
                    packages: [ { name: 'pkg-a' }, { name: 'pkg-b' } ]
                }
            }),
            [ 'source/pkg-a/CHANGELOG.md', 'source/pkg-b/CHANGELOG.md' ]
        );
    });
});
