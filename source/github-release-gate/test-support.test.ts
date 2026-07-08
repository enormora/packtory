import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import {
    ciRunsPath,
    closeServer,
    createBaseEnvironment,
    createBaseRoutes,
    getRouteKey,
    getServerPort,
    pullsPath,
    runEntryPointScript,
    withGitHubApiServer,
    workspaceOutputPath,
    type EntryPointScriptDependencies
} from '../test-libraries/github-release-gate-test-support.ts';
import { withDeadline } from '../test-libraries/with-deadline.ts';

type EntryPointScriptCall = {
    readonly execFile: {
        readonly args: readonly string[];
        readonly cwd: string;
        readonly encoding: 'utf8';
        readonly file: string;
        readonly githubOutput: string | undefined;
    };
    readonly mkdtempPrefix: string;
    readonly readFile: { readonly encoding: 'utf8'; readonly path: string; };
};

const testDeadlineMilliseconds = 200;

function isClosedServerFetchFailure(error: unknown): boolean {
    return error instanceof Error &&
        [ 'TypeError', 'TimeoutError', 'AbortError' ].includes(error.name);
}

suite('github-release-gate-test-support', function () {
    test('createBaseEnvironment exposes the expected default publish settings', function () {
        assert.strictEqual(workspaceOutputPath, '/workspace/github-output.txt');
        assert.deepStrictEqual(createBaseEnvironment(), {
            CI_WORKFLOW_FILE: 'ci.yml',
            DEFAULT_BRANCH: 'main',
            DEPENDENCY_ONLY_MIN_AGE_DAYS: '7',
            GITHUB_OUTPUT: '/workspace/github-output.txt',
            GITHUB_REPOSITORY: 'enormora/packtory',
            GITHUB_TOKEN: 'token',
            MAX_LATENCY_HOURS: '24',
            QUIET_PERIOD_MINUTES: '45'
        });
    });

    test('createBaseRoutes contains the expected GitHub release gate fixture URLs', function () {
        const routes = createBaseRoutes();
        const ciRunsRoute = routes[ciRunsPath];
        const pullsRoute = routes[pullsPath];

        if (ciRunsRoute === undefined || pullsRoute === undefined) {
            assert.fail('expected base GitHub API routes');
        }
        assert.strictEqual(
            (ciRunsRoute.body as { readonly workflow_runs: readonly [{ readonly html_url: string; }]; })
                .workflow_runs[0]
                .html_url,
            'https://github.com/enormora/packtory/actions/runs/1'
        );
        assert.strictEqual(
            (pullsRoute.body as readonly [{ readonly html_url: string; }])[0].html_url,
            'https://github.com/enormora/packtory/pull/1'
        );
    });

    test('getRouteKey falls back to the root path when the request URL is missing', function () {
        assert.strictEqual(getRouteKey(undefined), '/');
        assert.strictEqual(getRouteKey('/ready'), '/ready');
    });

    test('getServerPort returns the TCP port when the server exposes an address object', function () {
        assert.strictEqual(
            getServerPort({
                address() {
                    return { address: '127.0.0.1', family: 'IPv4', port: 4312 };
                }
            }),
            4312
        );
    });

    test('getServerPort rejects null and string addresses', function () {
        assert.throws(function () {
            getServerPort({
                address() {
                    return null;
                }
            });
        }, /Expected TCP server address/u);
        assert.throws(function () {
            getServerPort({
                address() {
                    return 'pipe';
                }
            });
        }, /Expected TCP server address/u);
    });

    test('closeServer resolves on a clean server shutdown', async function () {
        let didClose = false;
        const shutdown = closeServer({
            close(callback) {
                didClose = true;
                callback();
            }
        });
        await withDeadline(shutdown, 'closeServer', testDeadlineMilliseconds);

        assert.strictEqual(didClose, true);
    });

    test('closeServer rejects when the server close callback receives an error', async function () {
        await assert.rejects(async function () {
            await withDeadline(
                closeServer({
                    close(callback) {
                        callback(new Error('close failed'));
                    }
                }),
                'closeServer',
                testDeadlineMilliseconds
            );
        }, /close failed/u);
    });

    test('withGitHubApiServer returns a 404 JSON response for unknown routes', async function () {
        await withDeadline(
            withGitHubApiServer({}, async function (apiBaseUrl) {
                const response = await fetch(`${apiBaseUrl}/missing`, {
                    signal: AbortSignal.timeout(testDeadlineMilliseconds)
                });

                assert.strictEqual(response.status, 404);
                assert.strictEqual(response.headers.get('content-type'), 'application/json');
                assert.deepStrictEqual(await response.json(), {
                    message: 'No route for /missing'
                });
            }),
            'withGitHubApiServer',
            testDeadlineMilliseconds
        );
    });

    test('withGitHubApiServer returns the action result, serves JSON, and closes afterwards', async function () {
        let apiBaseUrl = '';

        const actionResult = await withDeadline(
            withGitHubApiServer(
                {
                    '/ready': {
                        body: { ok: true },
                        headers: { 'x-test': '1' },
                        status: 201
                    }
                },
                async function (url) {
                    apiBaseUrl = url;
                    const response = await fetch(`${url}/ready`, {
                        signal: AbortSignal.timeout(testDeadlineMilliseconds)
                    });

                    assert.strictEqual(response.status, 201);
                    assert.strictEqual(response.headers.get('content-type'), 'application/json');
                    assert.strictEqual(response.headers.get('x-test'), '1');
                    assert.deepStrictEqual(await response.json(), { ok: true });
                    return 'done';
                }
            ),
            'withGitHubApiServer',
            testDeadlineMilliseconds
        );

        assert.strictEqual(actionResult, 'done');
        assert.match(apiBaseUrl, /^http:\/\/127\.0\.0\.1:\d+$/u);
        await assert.rejects(
            async function () {
                await fetch(`${apiBaseUrl}/ready`, {
                    signal: AbortSignal.timeout(testDeadlineMilliseconds)
                });
            },
            isClosedServerFetchFailure
        );
    });

    test('runEntryPointScript uses the expected temp prefix, utf8 encoding, and output fallback', async function () {
        const safeTemporaryRoot = path.join('/', 'safe-temp');
        const scriptTemporaryFolder = path.join(safeTemporaryRoot, 'packtory-github-release-gate-123');
        const scriptOutputPath = path.join(scriptTemporaryFolder, 'github-output.txt');
        let observedReadFile: EntryPointScriptCall['readFile'] | null = null;
        let calls: EntryPointScriptCall | null = null;
        const dependencies: EntryPointScriptDependencies = {
            cwd: '/workspace',
            execFile(file, args, options, callback) {
                calls = {
                    execFile: {
                        args,
                        cwd: options.cwd,
                        encoding: options.encoding,
                        file,
                        githubOutput: options.env.GITHUB_OUTPUT
                    },
                    mkdtempPrefix: path.join(safeTemporaryRoot, 'packtory-github-release-gate-'),
                    readFile: { encoding: 'utf8', path: scriptOutputPath }
                };
                callback(null, 'stdout-', 'stderr-');
            },
            async mkdtemp(prefix) {
                assert.strictEqual(prefix, path.join(safeTemporaryRoot, 'packtory-github-release-gate-'));
                return scriptTemporaryFolder;
            },
            processExecPath: '/node',
            async readFile(filePath, options) {
                observedReadFile = { encoding: options.encoding, path: filePath };
                throw new Error('missing');
            },
            tmpdir() {
                return safeTemporaryRoot;
            }
        };

        const result = await withDeadline(
            runEntryPointScript('/entry.ts', { TOKEN: 'x' }, dependencies),
            'runEntryPointScript',
            testDeadlineMilliseconds
        );

        assert.deepStrictEqual(result, {
            exitCode: 0,
            output: 'stdout-stderr-'
        });
        assert.deepStrictEqual(observedReadFile, { encoding: 'utf8', path: scriptOutputPath });
        assert.deepStrictEqual(calls, {
            execFile: {
                args: [ '--experimental-strip-types', '--enable-source-maps', '/entry.ts' ],
                cwd: '/workspace',
                encoding: 'utf8',
                file: '/node',
                githubOutput: scriptOutputPath
            },
            mkdtempPrefix: path.join(safeTemporaryRoot, 'packtory-github-release-gate-'),
            readFile: { encoding: 'utf8', path: scriptOutputPath }
        });
    });
});
