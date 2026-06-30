import assert from 'node:assert/strict';
import path from 'node:path';
import type { Server } from 'node:http';
import getPort from 'get-port';
import { runServer } from 'verdaccio';
import type { RegistrySettings } from '../source/config/registry-settings.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';

const username = 'foo';
const password = 'top-secret';
const registryKeepAliveTimeoutMilliseconds = 120_000;
const registryHeadersTimeoutMilliseconds = 125_000;

function isServerNotRunningError(error: Error): boolean {
    return Object.hasOwn(error, 'code') && Reflect.get(error, 'code') === 'ERR_SERVER_NOT_RUNNING';
}

type ListenableServer = {
    listen: (port: number, callback: () => void) => Server;
};

function isListenableServer(value: unknown): value is ListenableServer {
    return typeof value === 'object' &&
        value !== null &&
        typeof Reflect.get(value, 'listen') === 'function';
}

async function startServer(server: ListenableServer, port: number): Promise<Server> {
    return new Promise(function (resolve, reject) {
        const httpServer = server.listen(port, function () {
            resolve(httpServer);
        });
        httpServer.keepAliveTimeout = registryKeepAliveTimeoutMilliseconds;
        httpServer.headersTimeout = registryHeadersTimeoutMilliseconds;
        httpServer.once('error', reject);
    });
}

async function stopServer(server: Server): Promise<void> {
    return new Promise(function (resolve, reject) {
        server.close(function (error) {
            if (error === undefined || isServerNotRunningError(error)) {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

async function createRegistryServer(storageDirectory: string): Promise<ListenableServer> {
    const configuration = {
        self_path: storageDirectory,
        storage: storageDirectory,
        web: { enable: false },
        uplinks: {},
        packages: {
            '**': {
                access: '$all',
                publish: '$authenticated',
                proxy: []
            }
        },
        auth: {
            htpasswd: {
                file: path.join(process.cwd(), 'integration-tests/fixtures/verdaccio-htpasswd'),
                algorithm: 'bcrypt',
                rounds: 10
            }
        },
        log: {
            type: 'stdout',
            level: 'fatal'
        },
        security: {
            api: {
                legacy: false,
                jwt: {
                    sign: {
                        expiresIn: '1d'
                    }
                }
            }
        }
    } as const;

    const server: unknown = await runServer(configuration);
    assert.ok(isListenableServer(server), 'Verdaccio did not return a listenable server');
    return server;
}

function getRegistryToken(responseBody: unknown): string {
    assert.ok(typeof responseBody === 'object' && responseBody !== null, 'Registry token response must be an object');
    const token: unknown = Reflect.get(responseBody, 'token');
    assert.ok(typeof token === 'string', 'Could not create a registry token for the benchmark registry');
    return token;
}

async function createToken(registryUrl: string): Promise<string> {
    const credentials = `${username}:${password}`;
    const response = await fetch(`${registryUrl}/-/npm/v1/tokens`, {
        method: 'POST',
        body: JSON.stringify({
            password,
            readonly: false,
            cidr_whitelist: [ '0.0.0.0/0' ]
        }),
        headers: {
            'content-type': 'application/json',
            Authorization: `Basic ${btoa(credentials)}`
        }
    });

    const body: unknown = await response.json();
    return getRegistryToken(body);
}

export type RegistryHandle = {
    readonly settings: RegistrySettings;
    close: () => Promise<void>;
};

export async function startBenchmarkRegistry(): Promise<RegistryHandle> {
    const storageDirectory = await createTemporaryDirectory('packtory-benchmark-registry-');
    const server = await createRegistryServer(storageDirectory);
    const port = await getPort();
    const registryUrl = `http://localhost:${port}`;

    const httpServer = await startServer(server, port);
    const token = await createToken(registryUrl);

    return {
        settings: {
            registryUrl,
            auth: {
                type: 'bearer-token',
                token
            }
        },
        async close() {
            try {
                await stopServer(httpServer);
            } finally {
                await removeDirectory(storageDirectory);
            }
        }
    };
}
