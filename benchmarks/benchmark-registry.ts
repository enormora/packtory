/* eslint-disable node/no-process-env, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/prefer-destructuring, unicorn/prefer-type-error -- Benchmark registry setup is a script-oriented test utility. */

import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { Server } from 'node:http';
import getPort from 'get-port';
import { runServer } from 'verdaccio';
import type { RegistrySettings } from '../source/config/registry-settings.ts';

const userName = 'foo';
const password = 'top-secret';

function getEnvironmentVariable(variableName: string): string | undefined {
    const environment = process.env[variableName];
    return typeof environment === 'string' ? environment : undefined;
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
            if (error === undefined || (error as { code?: string }).code === 'ERR_SERVER_NOT_RUNNING') {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

async function createTemporaryDirectory(): Promise<string> {
    const tempRootDirectory = getEnvironmentVariable('RUNNER_TEMP') ?? os.tmpdir();
    return fs.mkdtemp(path.join(tempRootDirectory, 'packtory-benchmark-registry-'));
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

    return (await runServer(configuration)) as Server;
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

    const body = (await response.json()) as Record<string, unknown>;
    const token = body.token;

    if (typeof token !== 'string') {
        throw new Error('Could not create a registry token for the benchmark registry');
    }

    return token;
}

export type RegistryHandle = {
    readonly settings: RegistrySettings;
    close: () => Promise<void>;
};

export async function startBenchmarkRegistry(): Promise<RegistryHandle> {
    const storageDirectory = await createTemporaryDirectory();
    const server = await createRegistryServer(storageDirectory);
    const port = await getPort();
    const registryUrl = `http://localhost:${port}`;

    await startServer(server, port);
    const token = await createToken(registryUrl);

    return {
        settings: {
            registryUrl,
            token
        },
        async close() {
            try {
                await stopServer(server);
            } finally {
                await fs.rm(storageDirectory, { recursive: true, force: true });
            }
        }
    };
}
