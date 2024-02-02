import path from 'node:path';
import type { Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import getPort from 'get-port';
import { runServer } from 'verdaccio';
import test, { type ExecutionContext } from 'ava';

const userName = 'foo';
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
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, resolve);
    });
}

async function stopServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error === undefined) {
                resolve();
            } else {
                reject(error);
            }
        });
    });
}

async function createTemporaryDirectory(): Promise<string> {
    // eslint-disable-next-line node/no-process-env -- github actions runner don’t allow writing into the os temporary directory, so we need to use the job temp dir from the environment variable
    const tempRootDir = process.env.RUNNER_TEMP ?? os.tmpdir();
    return fs.mkdtemp(tempRootDir);
}

async function createRegistryServer(storageDirectory: string): Promise<Server> {
    // @ts-expect-error
    const server = (await runServer({ ...configuration, storage: storageDirectory })) as Server;
    return server;
}

export type RegistryDetails = {
    registryUrl: string;
    token: string;
};

async function startRegistry(server: Server): Promise<RegistryDetails> {
    const port = await getPort();
    const registryUrl = `http://localhost:${port}`;
    const credentials = `${userName}:${password}`;

    await startServer(server, port);
    const response = await fetch(`${registryUrl}/-/npm/v1/tokens`, {
        method: 'POST',
        body: JSON.stringify({
            password,
            readonly: false,
            cidr_whitelist: ['0.0.0.0/0']
        }),
        headers: { 'content-type': 'application/json', Authorization: `Basic ${btoa(credentials)}` }
    });
    const body = (await response.json()) as Record<string, string>;

    const { token } = body;

    if (token === undefined) {
        throw new Error('Couldn’t create a token');
    }

    return { registryUrl, token };
}

export const checkWithRegistry = test.macro(
    async (t, callback: (t: ExecutionContext, registryDetails: RegistryDetails) => Promise<void>) => {
        const storageDirectory = await createTemporaryDirectory();
        const server = await createRegistryServer(storageDirectory);
        try {
            const registryDetails = await startRegistry(server);
            await callback(t, registryDetails);
        } finally {
            try {
                await stopServer(server);
            } finally {
                await fs.rm(storageDirectory, { recursive: true, force: true });
            }
        }
    }
);
