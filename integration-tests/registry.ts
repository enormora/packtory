import path from 'node:path';
import type { Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import getPort from 'get-port';
import type { AsyncFunc } from 'mocha';
import { runServer } from 'verdaccio';

const username = 'foo';
const password = 'top-secret';

const configuration = {
    self_path: path.join(process.cwd(), 'verdaccio-cache'),
    web: {
        enable: false
    },
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
    logs: {
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
};

async function startServer(server: Server, port: number): Promise<void> {
    return new Promise(function (resolve, reject) {
        server.once('error', reject);
        server.listen(port, resolve);
    });
}

async function stopServer(server: Server): Promise<void> {
    return new Promise(function (resolve, reject) {
        server.close(function (error) {
            if (error === undefined || (error as { readonly code?: string; }).code === 'ERR_SERVER_NOT_RUNNING') {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

function getEnvironmentVariable(variableName: string): string | undefined {
    const environment: unknown = Reflect.get(process, 'env');

    if (typeof environment !== 'object' || environment === null) {
        return undefined;
    }

    const value: unknown = Reflect.get(environment, variableName);
    return typeof value === 'string' ? value : undefined;
}

async function createTemporaryDirectory(): Promise<string> {
    const tempRootDir = getEnvironmentVariable('RUNNER_TEMP') ?? os.tmpdir();
    return fs.mkdtemp(tempRootDir);
}

async function createRegistryServer(storageDirectory: string): Promise<Server> {
    const server = (await runServer({ ...configuration, storage: storageDirectory })) as Server;
    return server;
}

export type RegistryDetails = {
    readonly registryUrl: string;
    readonly token: string;
    readonly username: string;
    readonly password: string;
};

async function startRegistry(server: Server): Promise<RegistryDetails> {
    const port = await getPort();
    const registryUrl = `http://localhost:${port}`;
    const credentials = `${username}:${password}`;

    await startServer(server, port);
    const response = await fetch(`${registryUrl}/-/npm/v1/tokens`, {
        method: 'POST',
        body: JSON.stringify({
            password,
            readonly: false,
            cidr_whitelist: [ '0.0.0.0/0' ]
        }),
        headers: { 'content-type': 'application/json', Authorization: `Basic ${btoa(credentials)}` }
    });
    const body = (await response.json()) as Record<string, string>;

    const { token } = body;

    if (token === undefined) {
        throw new Error('Couldn’t create a token');
    }

    return { registryUrl, token, username, password };
}

export function checkWithRegistry(callback: (registryDetails: RegistryDetails) => Promise<void>): AsyncFunc {
    return async function () {
        const storageDirectory = await createTemporaryDirectory();
        const server = await createRegistryServer(storageDirectory);
        try {
            const registryDetails = await startRegistry(server);
            await callback(registryDetails);
        } finally {
            try {
                await stopServer(server);
            } finally {
                await fs.rm(storageDirectory, { recursive: true, force: true });
            }
        }
    };
}
