import type { AddressInfo as AddressInformation } from 'node:net';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile as executeFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { toGitHubResponse } from './github-response.ts';

export const continuousIntegrationRunsPath =
    '/repos/enormora/packtory/actions/workflows/continuous-integration.yml/runs?branch=main&event=push&head_sha=abc123&per_page=100';
export const pullsPath = '/repos/enormora/packtory/pulls?state=open&base=main&per_page=100';
export const timelinePath = '/repos/enormora/packtory/issues/1/timeline?per_page=100';
export const workspaceOutputPath = '/workspace/github-output.txt';

const applicationJavaScriptObjectNotationContentType = 'application/json';
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
type EnvironmentVariableReader = (variableName: string) => string | undefined;
type EntryPointScriptExecuteFileOptions = {
    readonly cwd: string;
    readonly encoding: 'utf8';
    readonly environment: Readonly<Record<string, string | undefined>>;
};
type EntryPointScriptReadFileOptions = {
    readonly encoding: 'utf8';
};
type EntryPointScriptExecuteFileError = {
    readonly code?: number | string | null;
};
type EntryPointScriptExecuteFile = (
    file: string,
    commandArguments: readonly string[],
    options: EntryPointScriptExecuteFileOptions,
    callback: (error: EntryPointScriptExecuteFileError | null, standardOutput: string, standardError: string) => void
) => void;
type EntryPointScriptReadFile = (
    filePath: string,
    options: EntryPointScriptReadFileOptions
) => Promise<string>;
type EntryPointScriptResult = {
    readonly exitCode: number;
    readonly output: string;
};
type EntryPointScriptExecutionResult = {
    readonly exitCode: number;
    readonly standardError: string;
    readonly standardOutput: string;
};
export type EntryPointScriptDependencies = {
    readonly cwd: string;
    readonly executeFile: EntryPointScriptExecuteFile;
    readonly mkdtemp: (prefix: string) => Promise<string>;
    readonly processExecutePath: string;
    readonly readFile: EntryPointScriptReadFile;
    readonly temporaryDirectory: () => string;
};

export function createEnvironmentVariableReader(
    environmentVariables: FakeEnvironment
): EnvironmentVariableReader {
    return function (variableName) {
        return environmentVariables[variableName];
    };
}

export function createBaseEnvironment(overrides: FakeEnvironment = {}): FakeEnvironment {
    return {
        CI_WORKFLOW_FILE: 'continuous-integration.yml',
        DEFAULT_BRANCH: 'main',
        DEPENDENCY_ONLY_MINIMUM_AGE_DAYS: '7',
        GITHUB_OUTPUT: workspaceOutputPath,
        GITHUB_REPOSITORY: 'enormora/packtory',
        GITHUB_TOKEN: 'token',
        MAXIMUM_LATENCY_HOURS: '24',
        QUIET_PERIOD_MINUTES: '45',
        ...overrides
    };
}

export function createBaseRoutes(): RouteMap {
    return {
        '/repos/enormora/packtory/branches/main': {
            body: { commit: { hash: 'abc123' } }
        },
        [continuousIntegrationRunsPath]: {
            body: {
                workflow_runs: [
                    {
                        conclusion: 'success',
                        event: 'push',
                        head_sha: 'abc123',
                        html_url: 'https://github.com/enormora/packtory/actions/runs/1',
                        status: 'completed',
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
                    committer: { date: '2026-05-19T10:30:00.000Z' },
                    created_at: null,
                    event: 'committed'
                }
            ]
        }
    };
}

type AddressableServer = {
    readonly address: () => AddressInformation | string | null;
};

type ClosableServer = {
    readonly close: (callback: (error?: Error) => void) => void;
};

export function getRouteKey(requestAddress: string | undefined): string {
    return requestAddress ?? '/';
}

export function getServerPort(server: AddressableServer): number {
    const address = server.address();

    if (address === null || typeof address === 'string') {
        throw new Error('Expected TCP server address');
    }

    return address.port;
}

export async function closeServer(server: ClosableServer): Promise<void> {
    await new Promise<void>(function (resolve, reject) {
        server.close(function (error) {
            if (error === undefined) {
                resolve();
                return;
            }

            reject(error);
        });
    });
}

async function readEntryPointOutput(
    dependencies: Readonly<EntryPointScriptDependencies>,
    outputPath: string
): Promise<string> {
    try {
        return await dependencies.readFile(outputPath, { encoding: 'utf8' });
    } catch {
        return '';
    }
}

export async function withGitHubApplicationProgrammingInterfaceServer<T>(
    routes: RouteMap,
    action: (applicationProgrammingInterfaceBaseAddress: string) => Promise<T>
): Promise<T> {
    const server = createServer(function (request: IncomingMessage, response: ServerResponse) {
        const requestAddress = getRouteKey(request.url);
        const route = routes[requestAddress];

        if (route === undefined) {
            response.writeHead(notFoundStatus, { 'content-type': applicationJavaScriptObjectNotationContentType });
            response.end(JSON.stringify({ message: `No route for ${requestAddress}` }));
            return;
        }

        response.writeHead(route.status ?? okStatus, {
            'content-type': applicationJavaScriptObjectNotationContentType,
            ...route.headers
        });
        response.end(JSON.stringify(toGitHubResponse(route.body)));
    });

    await new Promise<void>(function (resolve) {
        server.listen(0, localhostAddress, function () {
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
        executeFile(file, commandArguments, options, callback) {
            executeFile(file, commandArguments, {
                cwd: options.cwd,
                encoding: options.encoding,
                env: options.environment
            }, callback);
        },
        async mkdtemp(prefix) {
            return await mkdtemp(prefix);
        },
        processExecutePath: process.execPath,
        async readFile(filePath, options) {
            return await readFile(filePath, options);
        },
        temporaryDirectory
    }
): Promise<EntryPointScriptResult> {
    const temporaryFolder = await dependencies.mkdtemp(
        path.join(dependencies.temporaryDirectory(), githubReleaseGateTemporaryFolderPrefix)
    );
    const outputPath = path.join(temporaryFolder, 'github-output.txt');
    const executionResult = await new Promise<EntryPointScriptExecutionResult>(function (resolve) {
        dependencies.executeFile(
            dependencies.processExecutePath,
            [ '--experimental-strip-types', '--enable-source-maps', entryPointPath ],
            {
                cwd: dependencies.cwd,
                encoding: 'utf8',
                environment: {
                    ...environmentVariables,
                    GITHUB_OUTPUT: outputPath
                }
            },
            function (error, standardOutput, standardError) {
                resolve({
                    exitCode: typeof error?.code === 'number' ? error.code : 0,
                    standardError,
                    standardOutput
                });
            }
        );
    });
    const output = await readEntryPointOutput(dependencies, outputPath);

    return {
        exitCode: executionResult.exitCode,
        output: `${executionResult.standardOutput}${executionResult.standardError}${output}`
    };
}
