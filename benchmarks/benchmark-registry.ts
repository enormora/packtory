import assert from 'node:assert/strict';
import path from 'node:path';
import type { Server } from 'node:http';
import { runServer } from 'verdaccio';
import type { RegistrySettings } from '../source/configuration/registry-settings.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';

const username = 'foo';
const password = 'top-secret';
const registryKeepAliveTimeoutMilliseconds = 120_000;
const registryHeadersTimeoutMilliseconds = 125_000;

function isServerNotRunningError(error: Error): boolean {
    return Object.hasOwn(error, 'code') && Reflect.get(error, 'code') === 'ERR_SERVER_NOT_RUNNING';
}

type ListenableServer = {
    listen: (port: number, hostname: string, callback: () => void) => Server;
};

function isListenableServer(value: unknown): value is ListenableServer {
    return typeof value === 'object' &&
        value !== null &&
        typeof Reflect.get(value, 'listen') === 'function';
}

async function startServer(server: ListenableServer): Promise<Server> {
    return new Promise(function (resolve, reject) {
        const webServer = server.listen(0, '127.0.0.1', function () {
            resolve(webServer);
        });
        webServer.keepAliveTimeout = registryKeepAliveTimeoutMilliseconds;
        webServer.headersTimeout = registryHeadersTimeoutMilliseconds;
        webServer.once('error', reject);
    });
}

function registryAddressFor(server: Server): string {
    const address = server.address();
    assert.ok(address !== null && typeof address === 'object');
    return `http://127.0.0.1:${address.port}`;
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

async function createToken(registryAddress: string): Promise<string> {
    const credentials = `${username}:${password}`;
    const response = await fetch(`${registryAddress}/-/user/org.couchdb.user:${username}`, {
        method: 'PUT',
        body: JSON.stringify({
            name: username,
            password
        }),
        headers: {
            'content-type': 'application/json',
            Authorization: `Basic ${btoa(credentials)}`
        }
    });

    const body: unknown = await response.json();
    assert.ok(response.ok, `Benchmark registry token request failed with HTTP ${response.status}`);
    return getRegistryToken(body);
}

export type RegistryHandle = {
    readonly settings: RegistrySettings;
    close: () => Promise<void>;
};

async function releaseRegistry(server: Server, storageDirectory: string): Promise<void> {
    try {
        await stopServer(server);
    } finally {
        await removeDirectory(storageDirectory);
    }
}

export async function startBenchmarkRegistry(): Promise<RegistryHandle> {
    const storageDirectory = await createTemporaryDirectory('packtory-benchmark-registry-');
    const server = await createRegistryServer(storageDirectory);
    const webServer = await startServer(server);
    const registryAddress = registryAddressFor(webServer);
    try {
        const token = await createToken(registryAddress);
        return {
            settings: {
                registryAddress,
                authentication: {
                    publish: { type: 'bearer-token', token },
                    metadata: 'anonymous'
                }
            },
            async close() {
                await releaseRegistry(webServer, storageDirectory);
            }
        };
    } catch (error: unknown) {
        await releaseRegistry(webServer, storageDirectory);
        throw error;
    }
}
