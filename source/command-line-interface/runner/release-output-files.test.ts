import assert from 'node:assert';
import { suite, test } from 'mocha';
import { collectReleaseOutputFiles } from './release-output-files.ts';

suite('release-output-files', function () {
    test('returns no files when changelog outputs are not configured', function () {
        assert.deepStrictEqual(
            collectReleaseOutputFiles({
                workingDirectory: '/repo',
                configuration: { packages: [ { name: 'package-a' } ] }
            }),
            []
        );
    });

    test('collects repository and package changelog outputs as release files', function () {
        assert.deepStrictEqual(
            collectReleaseOutputFiles({
                workingDirectory: '/repo',
                configuration: {
                    changelog: {
                        outputs: [
                            { kind: 'repository-file', path: 'CHANGELOG.md' },
                            { kind: 'package-file', path: 'documentation/CHANGELOG.md' },
                            { kind: 'github-release' }
                        ]
                    },
                    commonPackageSettings: { sourcesFolder: 'packages' },
                    packages: [ { name: 'package-a' }, { name: 'package-b', sourcesFolder: 'other/package-b' } ]
                }
            }),
            [ 'CHANGELOG.md', 'packages/documentation/CHANGELOG.md', 'other/package-b/documentation/CHANGELOG.md' ]
        );
    });

    test('collects explicit package changelog outputs', function () {
        assert.deepStrictEqual(
            collectReleaseOutputFiles({
                workingDirectory: '/repo',
                configuration: {
                    changelog: {
                        outputs: [
                            {
                                kind: 'package-file',
                                paths: {
                                    'package-a': 'source/package-a/CHANGELOG.md',
                                    'package-b': 'source/package-b/CHANGELOG.md'
                                }
                            }
                        ]
                    },
                    packages: [ { name: 'package-a' }, { name: 'package-b' } ]
                }
            }),
            [ 'source/package-a/CHANGELOG.md', 'source/package-b/CHANGELOG.md' ]
        );
    });
});
