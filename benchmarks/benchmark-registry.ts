import assert from 'node:assert/strict';
import path from 'node:path';
import type { Server } from 'node:http';
import getPort from 'get-port';
import { runServer } from 'verdaccio';
import type { RegistrySettings } from '../source/config/registry-settings.ts';
import { createTemporaryDirectory, removeDirectory } from './benchmark-filesystem.ts';

const userName = 'foo';
const password = 'top-secret';

function isServerNotRunningError(error: Error): boolean {
    return 'code' in error && error.code === 'ERR_SERVER_NOT_RUNNING';
}

function isServer(value: unknown): value is Server {
    return typeof value === 'object' && value !== null && 'listen' in value && 'close' in value;
}

async function startServer(server: Server, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, resolve);
    });
}

async function stopServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error === undefined || isServerNotRunningError(error)) {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

async function createRegistryServer(storageDirectory: string): Promise<Server> {
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
    assert.ok(isServer(server), 'Verdaccio did not return an HTTP server instance');
    return server;
}

function getRegistryToken(responseBody: unknown): string {
    assert.ok(typeof responseBody === 'object' && responseBody !== null, 'Registry token response must be an object');
    const token: unknown = Reflect.get(responseBody, 'token');
    assert.ok(typeof token === 'string', 'Could not create a registry token for the benchmark registry');
    return token;
}

async function createToken(registryUrl: string): Promise<string> {
    const credentials = `${userName}:${password}`;
    const response = await fetch(`${registryUrl}/-/npm/v1/tokens`, {
        method: 'POST',
        body: JSON.stringify({
            password,
            readonly: false,
            cidr_whitelist: ['0.0.0.0/0']
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

    await startServer(server, port);
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
                await stopServer(server);
            } finally {
                await removeDirectory(storageDirectory);
            }
        }
    };
}
