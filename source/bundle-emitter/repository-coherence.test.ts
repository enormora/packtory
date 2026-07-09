import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    assertRepositoryCoherence,
    getCiRepositoryUrl,
    readCiEnvironment,
    type CiEnvironment
} from './repository-coherence.ts';
import { normalizeRepositoryUrl } from './repository-url-normalizer.ts';

const expectedNoRepositoryDeclaredMessage = 'Provenance is enabled but the package has no repository declared.\n' +
    'Add a "repository" entry to additionalPackageJsonAttributes\n' +
    "so consumers can verify the attestation's source claim.";

const expectedNoCiDetectedMessage = 'Provenance auto mode is enabled but no CI repository was detected.\n' +
    'Provenance auto mode requires GitHub Actions or GitLab CI; expected\n' +
    'one of GITHUB_SERVER_URL+GITHUB_REPOSITORY or CI_PROJECT_URL.';

function buildExpectedMismatchMessage(configuredUrl: string, ciUrl: string): string {
    return (
        "Provenance is enabled but the package's repository URL does not match\n" +
        'the CI repository.\n' +
        `Configured repository: ${configuredUrl}\n` +
        `CI repository:         ${ciUrl}\n` +
        'Either correct the package.json repository field, or disable provenance\n' +
        'if the mismatch is intentional.'
    );
}

suite('repository-coherence', function () {
    suite('invalid repository urls', function () {
        test('normalizeRepositoryUrl() returns undefined for undefined input', function () {
            assert.strictEqual(normalizeRepositoryUrl(undefined), undefined);
        });

        test('normalizeRepositoryUrl() returns undefined for an empty string', function () {
            assert.strictEqual(normalizeRepositoryUrl(''), undefined);
        });

        test('normalizeRepositoryUrl() returns undefined for null input', function () {
            assert.strictEqual(normalizeRepositoryUrl(null), undefined);
        });

        test('normalizeRepositoryUrl() returns undefined for numeric input', function () {
            assert.strictEqual(normalizeRepositoryUrl(42), undefined);
        });

        test('normalizeRepositoryUrl() returns undefined for an array input', function () {
            assert.strictEqual(normalizeRepositoryUrl([ 'https://github.com/foo/bar' ]), undefined);
        });

        test('normalizeRepositoryUrl() returns undefined for object input missing the url property', function () {
            assert.strictEqual(normalizeRepositoryUrl({ type: 'git' }), undefined);
        });

        test('normalizeRepositoryUrl() returns undefined for object input with an empty url property', function () {
            assert.strictEqual(normalizeRepositoryUrl({ url: '' }), undefined);
        });

        test('normalizeRepositoryUrl() returns undefined for object input with a non-string url property', function () {
            assert.strictEqual(normalizeRepositoryUrl({ url: 42 }), undefined);
        });
    });

    suite('hosted repository urls', function () {
        suite('GitHub urls', function () {
            test('normalizeRepositoryUrl() canonicalizes a plain https GitHub url', function () {
                assert.strictEqual(normalizeRepositoryUrl('https://github.com/foo/bar'), 'https://github.com/foo/bar');
            });

            test('normalizeRepositoryUrl() canonicalizes a https GitHub url with a .git suffix', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('https://github.com/foo/bar.git'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() canonicalizes a https GitHub url with a trailing slash', function () {
                assert.strictEqual(normalizeRepositoryUrl('https://github.com/foo/bar/'), 'https://github.com/foo/bar');
            });

            test('normalizeRepositoryUrl() canonicalizes a git+https GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('git+https://github.com/foo/bar.git'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() canonicalizes a git+ssh GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('git+ssh://git@github.com/foo/bar.git'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() canonicalizes an SCP-style GitHub url', function () {
                assert.strictEqual(normalizeRepositoryUrl('git@github.com:foo/bar.git'), 'https://github.com/foo/bar');
            });

            test('normalizeRepositoryUrl() canonicalizes an npm shorthand GitHub url', function () {
                assert.strictEqual(normalizeRepositoryUrl('github:foo/bar'), 'https://github.com/foo/bar');
            });
        });

        suite('GitLab urls', function () {
            test('normalizeRepositoryUrl() canonicalizes a https GitLab url', function () {
                assert.strictEqual(normalizeRepositoryUrl('https://gitlab.com/foo/bar'), 'https://gitlab.com/foo/bar');
            });
        });

        suite('object urls', function () {
            test('normalizeRepositoryUrl() canonicalizes the object form with a url property', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl({ type: 'git', url: 'git+ssh://git@github.com/foo/bar.git' }),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() lowercases mixed-case host and path', function () {
                assert.strictEqual(normalizeRepositoryUrl('https://Github.com/Foo/Bar'), 'https://github.com/foo/bar');
            });

            test('normalizeRepositoryUrl() drops a committish from a hosted GitHub url', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('https://github.com/foo/bar#main'),
                    'https://github.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() ignores the directory field on the object form', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl({
                        type: 'git',
                        url: 'https://github.com/foo/bar',
                        directory: 'packages/inner'
                    }),
                    'https://github.com/foo/bar'
                );
            });
        });

        suite('self-hosted urls', function () {
            test('normalizeRepositoryUrl() falls back to manual normalization for self-hosted https urls', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('https://gitea.example.com/foo/bar.git'),
                    'https://gitea.example.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() strips a trailing slash for self-hosted urls', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('https://gitea.example.com/foo/bar/'),
                    'https://gitea.example.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() strips a git+ prefix for self-hosted urls', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('git+https://gitea.example.com/foo/bar.git'),
                    'https://gitea.example.com/foo/bar'
                );
            });

            test('normalizeRepositoryUrl() lowercases self-hosted urls', function () {
                assert.strictEqual(
                    normalizeRepositoryUrl('https://Gitea.Example.com/Foo/Bar'),
                    'https://gitea.example.com/foo/bar'
                );
            });
        });
    });

    suite('CI repository urls', function () {
        test('getCiRepositoryUrl() returns undefined when no env vars are set', function () {
            const env: CiEnvironment = {
                githubServerUrl: undefined,
                githubRepository: undefined,
                gitlabProjectUrl: undefined
            };

            assert.strictEqual(getCiRepositoryUrl(env), undefined);
        });

        test('getCiRepositoryUrl() returns the GitHub Actions repository url when both GHA env vars are set', function () {
            const env: CiEnvironment = {
                githubServerUrl: 'https://github.com',
                githubRepository: 'enormora/packtory',
                gitlabProjectUrl: undefined
            };

            assert.strictEqual(getCiRepositoryUrl(env), 'https://github.com/enormora/packtory');
        });

        test('getCiRepositoryUrl() returns the GitLab CI repository url when only the GitLab var is set', function () {
            const env: CiEnvironment = {
                githubServerUrl: undefined,
                githubRepository: undefined,
                gitlabProjectUrl: 'https://gitlab.com/enormora/packtory'
            };

            assert.strictEqual(getCiRepositoryUrl(env), 'https://gitlab.com/enormora/packtory');
        });

        test('getCiRepositoryUrl() prefers GitHub Actions over GitLab when both are set', function () {
            const env: CiEnvironment = {
                githubServerUrl: 'https://github.com',
                githubRepository: 'enormora/packtory',
                gitlabProjectUrl: 'https://gitlab.com/some/other'
            };

            assert.strictEqual(getCiRepositoryUrl(env), 'https://github.com/enormora/packtory');
        });

        test('getCiRepositoryUrl() returns undefined when only GITHUB_SERVER_URL is set', function () {
            const env: CiEnvironment = {
                githubServerUrl: 'https://github.com',
                githubRepository: undefined,
                gitlabProjectUrl: undefined
            };

            assert.strictEqual(getCiRepositoryUrl(env), undefined);
        });

        test('getCiRepositoryUrl() returns undefined when only GITHUB_REPOSITORY is set', function () {
            const env: CiEnvironment = {
                githubServerUrl: undefined,
                githubRepository: 'enormora/packtory',
                gitlabProjectUrl: undefined
            };

            assert.strictEqual(getCiRepositoryUrl(env), undefined);
        });

        test('getCiRepositoryUrl() treats empty env values as not set', function () {
            const env: CiEnvironment = {
                githubServerUrl: '',
                githubRepository: '',
                gitlabProjectUrl: ''
            };

            assert.strictEqual(getCiRepositoryUrl(env), undefined);
        });
    });

    suite('repository coherence assertions', function () {
        test('assertRepositoryCoherence() does not throw when the manifest matches the CI repository', function () {
            assertRepositoryCoherence(
                { repository: 'git+ssh://git@github.com/enormora/packtory.git' },
                'https://github.com/enormora/packtory'
            );

            assert.strictEqual(
                getCiRepositoryUrl({
                    githubRepository: 'enormora/packtory',
                    githubServerUrl: 'https://github.com',
                    gitlabProjectUrl: ''
                }),
                'https://github.com/enormora/packtory'
            );
        });

        test('assertRepositoryCoherence() does not throw when the object form matches the CI repository', function () {
            assertRepositoryCoherence(
                { repository: { type: 'git', url: 'git+ssh://git@github.com/enormora/packtory.git' } },
                'https://github.com/enormora/packtory'
            );

            assert.strictEqual(
                normalizeRepositoryUrl('git+ssh://git@github.com/enormora/packtory.git'),
                'https://github.com/enormora/packtory'
            );
        });

        test('assertRepositoryCoherence() throws when the manifest repository differs from the CI repository', function () {
            assert.throws(
                function () {
                    assertRepositoryCoherence(
                        { repository: 'https://github.com/foo/forked-package' },
                        'https://github.com/upstream/package'
                    );
                },
                function (error: unknown) {
                    assert.ok(error instanceof Error);
                    assert.strictEqual(
                        error.message,
                        buildExpectedMismatchMessage(
                            'https://github.com/foo/forked-package',
                            'https://github.com/upstream/package'
                        )
                    );
                    return true;
                }
            );
        });

        test('assertRepositoryCoherence() throws the missing-repository error when the manifest has no repository', function () {
            assert.throws(
                function () {
                    assertRepositoryCoherence({}, 'https://github.com/enormora/packtory');
                },
                function (error: unknown) {
                    assert.ok(error instanceof Error);
                    assert.strictEqual(error.message, expectedNoRepositoryDeclaredMessage);
                    return true;
                }
            );
        });

        test('assertRepositoryCoherence() throws the missing-repository error when the repository is an unsupported value', function () {
            assert.throws(
                function () {
                    assertRepositoryCoherence({ repository: 42 }, 'https://github.com/enormora/packtory');
                },
                function (error: unknown) {
                    assert.ok(error instanceof Error);
                    assert.strictEqual(error.message, expectedNoRepositoryDeclaredMessage);
                    return true;
                }
            );
        });

        test('assertRepositoryCoherence() throws the missing-CI error when no CI repository url is provided', function () {
            assert.throws(
                function () {
                    assertRepositoryCoherence({ repository: 'https://github.com/enormora/packtory' }, undefined);
                },
                function (error: unknown) {
                    assert.ok(error instanceof Error);
                    assert.strictEqual(error.message, expectedNoCiDetectedMessage);
                    return true;
                }
            );
        });
    });

    suite('CI environment reads', function () {
        test('readCiEnvironment() reads GitHub Actions, GitLab CI, and missing env vars from the given env', function () {
            const env: CiEnvironment = readCiEnvironment({
                GITHUB_SERVER_URL: 'https://github.com',
                GITHUB_REPOSITORY: 'enormora/packtory',
                CI_PROJECT_URL: 'https://gitlab.com/some/other'
            });

            assert.deepStrictEqual(env, {
                githubServerUrl: 'https://github.com',
                githubRepository: 'enormora/packtory',
                gitlabProjectUrl: 'https://gitlab.com/some/other'
            });
        });

        test('readCiEnvironment() returns undefined values when env vars are absent', function () {
            const env: CiEnvironment = readCiEnvironment({});

            assert.deepStrictEqual(env, {
                githubServerUrl: undefined,
                githubRepository: undefined,
                gitlabProjectUrl: undefined
            });
        });
    });
});
