import assert from 'node:assert';
import { test } from 'mocha';
import {
    assertRepositoryCoherence,
    getCiRepositoryUrl,
    normalizeRepositoryUrl,
    readCiEnvironment,
    type CiEnvironment
} from './repository-coherence.ts';

const expectedNoRepositoryDeclaredMessage =
    'Provenance is enabled but the package has no repository declared.\n' +
    'Add a "repository" entry to additionalPackageJsonAttributes\n' +
    "so consumers can verify the attestation's source claim.";

const expectedNoCiDetectedMessage =
    'Provenance auto mode is enabled but no CI repository was detected.\n' +
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

test('normalizeRepositoryUrl() returns undefined for undefined input', () => {
    assert.strictEqual(normalizeRepositoryUrl(undefined), undefined);
});

test('normalizeRepositoryUrl() returns undefined for an empty string', () => {
    assert.strictEqual(normalizeRepositoryUrl(''), undefined);
});

test('normalizeRepositoryUrl() returns undefined for null input', () => {
    assert.strictEqual(normalizeRepositoryUrl(null), undefined);
});

test('normalizeRepositoryUrl() returns undefined for numeric input', () => {
    assert.strictEqual(normalizeRepositoryUrl(42), undefined);
});

test('normalizeRepositoryUrl() returns undefined for an array input', () => {
    assert.strictEqual(normalizeRepositoryUrl(['https://github.com/foo/bar']), undefined);
});

test('normalizeRepositoryUrl() returns undefined for object input missing the url property', () => {
    assert.strictEqual(normalizeRepositoryUrl({ type: 'git' }), undefined);
});

test('normalizeRepositoryUrl() returns undefined for object input with an empty url property', () => {
    assert.strictEqual(normalizeRepositoryUrl({ url: '' }), undefined);
});

test('normalizeRepositoryUrl() returns undefined for object input with a non-string url property', () => {
    assert.strictEqual(normalizeRepositoryUrl({ url: 42 }), undefined);
});

test('normalizeRepositoryUrl() canonicalizes a plain https GitHub url', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://github.com/foo/bar'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes a https GitHub url with a .git suffix', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://github.com/foo/bar.git'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes a https GitHub url with a trailing slash', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://github.com/foo/bar/'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes a git+https GitHub url', () => {
    assert.strictEqual(normalizeRepositoryUrl('git+https://github.com/foo/bar.git'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes a git+ssh GitHub url', () => {
    assert.strictEqual(normalizeRepositoryUrl('git+ssh://git@github.com/foo/bar.git'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes an SCP-style GitHub url', () => {
    assert.strictEqual(normalizeRepositoryUrl('git@github.com:foo/bar.git'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes an npm shorthand GitHub url', () => {
    assert.strictEqual(normalizeRepositoryUrl('github:foo/bar'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes a https GitLab url', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://gitlab.com/foo/bar'), 'https://gitlab.com/foo/bar');
});

test('normalizeRepositoryUrl() canonicalizes the object form with a url property', () => {
    assert.strictEqual(
        normalizeRepositoryUrl({ type: 'git', url: 'git+ssh://git@github.com/foo/bar.git' }),
        'https://github.com/foo/bar'
    );
});

test('normalizeRepositoryUrl() lowercases mixed-case host and path', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://Github.com/Foo/Bar'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() drops a committish from a hosted GitHub url', () => {
    assert.strictEqual(normalizeRepositoryUrl('https://github.com/foo/bar#main'), 'https://github.com/foo/bar');
});

test('normalizeRepositoryUrl() ignores the directory field on the object form', () => {
    assert.strictEqual(
        normalizeRepositoryUrl({
            type: 'git',
            url: 'https://github.com/foo/bar',
            directory: 'packages/inner'
        }),
        'https://github.com/foo/bar'
    );
});

test('normalizeRepositoryUrl() falls back to manual normalization for self-hosted https urls', () => {
    assert.strictEqual(
        normalizeRepositoryUrl('https://gitea.example.com/foo/bar.git'),
        'https://gitea.example.com/foo/bar'
    );
});

test('normalizeRepositoryUrl() strips a trailing slash for self-hosted urls', () => {
    assert.strictEqual(
        normalizeRepositoryUrl('https://gitea.example.com/foo/bar/'),
        'https://gitea.example.com/foo/bar'
    );
});

test('normalizeRepositoryUrl() strips a git+ prefix for self-hosted urls', () => {
    assert.strictEqual(
        normalizeRepositoryUrl('git+https://gitea.example.com/foo/bar.git'),
        'https://gitea.example.com/foo/bar'
    );
});

test('normalizeRepositoryUrl() lowercases self-hosted urls', () => {
    assert.strictEqual(
        normalizeRepositoryUrl('https://Gitea.Example.com/Foo/Bar'),
        'https://gitea.example.com/foo/bar'
    );
});

test('getCiRepositoryUrl() returns undefined when no env vars are set', () => {
    const env: CiEnvironment = {
        githubServerUrl: undefined,
        githubRepository: undefined,
        gitlabProjectUrl: undefined
    };

    assert.strictEqual(getCiRepositoryUrl(env), undefined);
});

test('getCiRepositoryUrl() returns the GitHub Actions repository url when both GHA env vars are set', () => {
    const env: CiEnvironment = {
        githubServerUrl: 'https://github.com',
        githubRepository: 'enormora/packtory',
        gitlabProjectUrl: undefined
    };

    assert.strictEqual(getCiRepositoryUrl(env), 'https://github.com/enormora/packtory');
});

test('getCiRepositoryUrl() returns the GitLab CI repository url when only the GitLab var is set', () => {
    const env: CiEnvironment = {
        githubServerUrl: undefined,
        githubRepository: undefined,
        gitlabProjectUrl: 'https://gitlab.com/enormora/packtory'
    };

    assert.strictEqual(getCiRepositoryUrl(env), 'https://gitlab.com/enormora/packtory');
});

test('getCiRepositoryUrl() prefers GitHub Actions over GitLab when both are set', () => {
    const env: CiEnvironment = {
        githubServerUrl: 'https://github.com',
        githubRepository: 'enormora/packtory',
        gitlabProjectUrl: 'https://gitlab.com/some/other'
    };

    assert.strictEqual(getCiRepositoryUrl(env), 'https://github.com/enormora/packtory');
});

test('getCiRepositoryUrl() returns undefined when only GITHUB_SERVER_URL is set', () => {
    const env: CiEnvironment = {
        githubServerUrl: 'https://github.com',
        githubRepository: undefined,
        gitlabProjectUrl: undefined
    };

    assert.strictEqual(getCiRepositoryUrl(env), undefined);
});

test('getCiRepositoryUrl() returns undefined when only GITHUB_REPOSITORY is set', () => {
    const env: CiEnvironment = {
        githubServerUrl: undefined,
        githubRepository: 'enormora/packtory',
        gitlabProjectUrl: undefined
    };

    assert.strictEqual(getCiRepositoryUrl(env), undefined);
});

test('getCiRepositoryUrl() treats empty env values as not set', () => {
    const env: CiEnvironment = {
        githubServerUrl: '',
        githubRepository: '',
        gitlabProjectUrl: ''
    };

    assert.strictEqual(getCiRepositoryUrl(env), undefined);
});

test('assertRepositoryCoherence() does not throw when the manifest matches the CI repository', () => {
    assert.doesNotThrow(() => {
        assertRepositoryCoherence(
            { repository: 'git+ssh://git@github.com/enormora/packtory.git' },
            'https://github.com/enormora/packtory'
        );
    });
});

test('assertRepositoryCoherence() does not throw when the object form matches the CI repository', () => {
    assert.doesNotThrow(() => {
        assertRepositoryCoherence(
            { repository: { type: 'git', url: 'git+ssh://git@github.com/enormora/packtory.git' } },
            'https://github.com/enormora/packtory'
        );
    });
});

test('assertRepositoryCoherence() throws when the manifest repository differs from the CI repository', () => {
    assert.throws(
        () => {
            assertRepositoryCoherence(
                { repository: 'https://github.com/foo/forked-package' },
                'https://github.com/upstream/package'
            );
        },
        (error: unknown) => {
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

test('assertRepositoryCoherence() throws the missing-repository error when the manifest has no repository', () => {
    assert.throws(
        () => {
            assertRepositoryCoherence({}, 'https://github.com/enormora/packtory');
        },
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, expectedNoRepositoryDeclaredMessage);
            return true;
        }
    );
});

test('assertRepositoryCoherence() throws the missing-repository error when the repository is an unsupported value', () => {
    assert.throws(
        () => {
            assertRepositoryCoherence({ repository: 42 }, 'https://github.com/enormora/packtory');
        },
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, expectedNoRepositoryDeclaredMessage);
            return true;
        }
    );
});

test('assertRepositoryCoherence() throws the missing-CI error when no CI repository url is provided', () => {
    assert.throws(
        () => {
            assertRepositoryCoherence({ repository: 'https://github.com/enormora/packtory' }, undefined);
        },
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, expectedNoCiDetectedMessage);
            return true;
        }
    );
});

test('readCiEnvironment() reads GitHub Actions, GitLab CI, and missing env vars from the given env', () => {
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

test('readCiEnvironment() returns undefined values when env vars are absent', () => {
    const env: CiEnvironment = readCiEnvironment({});

    assert.deepStrictEqual(env, {
        githubServerUrl: undefined,
        githubRepository: undefined,
        gitlabProjectUrl: undefined
    });
});
