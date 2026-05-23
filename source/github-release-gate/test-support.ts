import type { AddressInfo } from 'node:net';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile, type ExecFileException } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const ciRunsPath =
    '/repos/enormora/packtory/actions/workflows/ci.yml/runs' +
    '?branch=main&event=push&head_sha=abc123&status=completed&per_page=100';
export const pullsPath = '/repos/enormora/packtory/pulls?state=open&base=main&per_page=100';
export const timelinePath = '/repos/enormora/packtory/issues/1/timeline?per_page=100';
export const workspaceOutputPath = '/workspace/github-output.txt';

const applicationJsonContentType = 'application/json';
const localhostAddress = '127.0.0.1';
const githubReleaseGateTemporaryFolderPrefix = 'packtory-github-release-gate-';
const okStatus = 200;
const notFoundStatus = 404;

export type FakeEnvironment = Readonly<Record<string, string | undefined>>;

export type RouteResponse = {
    readonly body: unknown;
    readonly headers?: Readonly<Record<string, string>>;
    readonly status?: number;
};

export type RouteMap = Readonly<Record<string, RouteResponse>>;
type EntryPointScriptExecFile = (
    file: string,
    args: readonly string[],
    options: {
        readonly cwd: string;
        readonly encoding: 'utf8';
        readonly env: Record<string, string | undefined>;
    },
    callback: (error: ExecFileException | null, stdout: string, stderr: string) => void
) => void;
type EntryPointScriptReadFile = (
    filePath: string,
    options: {
        readonly encoding: 'utf8';
    }
) => Promise<string>;
export type EntryPointScriptDependencies = {
    readonly cwd: string;
    readonly execFile: EntryPointScriptExecFile;
    readonly mkdtemp: (prefix: string) => Promise<string>;
    readonly processExecPath: string;
    readonly readFile: EntryPointScriptReadFile;
    readonly tmpdir: () => string;
};

export function createEnvironmentVariableReader(
    environmentVariables: FakeEnvironment
): (variableName: string) => string | undefined {
    return (variableName) => {
        return environmentVariables[variableName];
    };
}

export function createBaseEnvironment(overrides: FakeEnvironment = {}): FakeEnvironment {
    return {
        CI_WORKFLOW_FILE: 'ci.yml',
        DEFAULT_BRANCH: 'main',
        DEPENDENCY_ONLY_MIN_AGE_DAYS: '7',
        GITHUB_OUTPUT: workspaceOutputPath,
        GITHUB_REPOSITORY: 'enormora/packtory',
        GITHUB_TOKEN: 'token',
        MAX_LATENCY_HOURS: '24',
        QUIET_PERIOD_MINUTES: '45',
        ...overrides
    };
}

export function createBaseRoutes(): RouteMap {
    return {
        '/repos/enormora/packtory/branches/main': {
            body: { commit: { sha: 'abc123' } }
        },
        [ciRunsPath]: {
            body: {
                workflow_runs: [
                    {
                        conclusion: 'success',
                        event: 'push',
                        head_sha: 'abc123',
                        html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                        updated_at: '2026-05-19T10:00:00.000Z'
                    }
                ]
            }
        },
        [pullsPath]: {
            body: [
                {
                    created_at: '2026-05-19T10:15:00.000Z',
                    html_url: 'https://github.com/enormora/packtory/pull/1',
                    number: 1
                }
            ]
        },
        [timelinePath]: {
            body: [
                {
                    created_at: '2026-05-19T10:30:00.000Z',
                    event: 'committed'
                }
            ]
        }
    };
}

type AddressableServer = {
    readonly address: () => AddressInfo | string | null;
};

type ClosableServer = {
    readonly close: (callback: (error?: Error) => void) => void;
};

export function getRouteKey(requestUrl: string | undefined): string {
    return requestUrl ?? '/';
}

export function getServerPort(server: AddressableServer): number {
    const address = server.address();

    if (address === null || typeof address === 'string') {
        throw new Error('Expected TCP server address');
    }

    return address.port;
}

export async function closeServer(server: ClosableServer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error === undefined) {
                resolve();
                return;
            }

            reject(error);
        });
    });
}

export async function withGitHubApiServer<T>(routes: RouteMap, action: (apiBaseUrl: string) => Promise<T>): Promise<T> {
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
        const requestUrl = getRouteKey(request.url);
        const route = routes[requestUrl];

        if (route === undefined) {
            response.writeHead(notFoundStatus, { 'content-type': applicationJsonContentType });
            response.end(JSON.stringify({ message: `No route for ${requestUrl}` }));
            return;
        }

        response.writeHead(route.status ?? okStatus, {
            'content-type': applicationJsonContentType,
            ...route.headers
        });
        response.end(JSON.stringify(route.body));
    });

    await new Promise<void>((resolve) => {
        server.listen(0, localhostAddress, () => {
            resolve();
        });
    });

    try {
        return await action(`http://${localhostAddress}:${getServerPort(server)}`);
    } finally {
        await closeServer(server);
    }
}

export async function runEntryPointScript(
    entryPointPath: string,
    environmentVariables: FakeEnvironment,
    dependencies: Readonly<EntryPointScriptDependencies> = {
        cwd: process.cwd(),
        execFile(file, args, options, callback) {
            execFile(file, args, options, callback);
        },
        async mkdtemp(prefix) {
            return await mkdtemp(prefix);
        },
        processExecPath: process.execPath,
        async readFile(filePath, options) {
            return await readFile(filePath, options);
        },
        tmpdir
    }
): Promise<{ readonly exitCode: number; readonly output: string }> {
    const temporaryFolder = await dependencies.mkdtemp(
        path.join(dependencies.tmpdir(), githubReleaseGateTemporaryFolderPrefix)
    );
    const outputPath = path.join(temporaryFolder, 'github-output.txt');
    const executionResult = await new Promise<{
        readonly exitCode: number;
        readonly standardError: string;
        readonly standardOutput: string;
    }>((resolve) => {
        dependencies.execFile(
            dependencies.processExecPath,
            ['--experimental-strip-types', '--enable-source-maps', entryPointPath],
            {
                cwd: dependencies.cwd,
                encoding: 'utf8',
                env: {
                    ...environmentVariables,
                    GITHUB_OUTPUT: outputPath
                }
            },
            (error, standardOutput, standardError) => {
                resolve({
                    exitCode: typeof error?.code === 'number' ? error.code : 0,
                    standardError,
                    standardOutput
                });
            }
        );
    });
    const output = await dependencies.readFile(outputPath, { encoding: 'utf8' }).catch(() => {
        return '';
    });

    return {
        exitCode: executionResult.exitCode,
        output: `${executionResult.standardOutput}${executionResult.standardError}${output}`
    };
}
