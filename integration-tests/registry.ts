import path from 'node:path';
import assert from 'node:assert';
import { request as requestRegistry, type Server } from 'node:http';
import fileSystem from 'node:fs/promises';
import operatingSystem from 'node:os';
import getPort from 'get-port';
import type { AsyncFunc as AsynchronousTestFunction } from 'mocha';
import { runServer } from 'verdaccio';
import { withRegistryServer } from './bundle-emitter/registry-server-test-support.ts';

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
};

async function startServer(server: Server, port: number): Promise<void> {
    return new Promise(function (resolve, reject) {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
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
    const temporaryRootDirectory = getEnvironmentVariable('RUNNER_TEMP') ?? operatingSystem.tmpdir();
    return fileSystem.mkdtemp(temporaryRootDirectory);
}

async function createRegistryServer(storageDirectory: string): Promise<Server> {
    const server = (await runServer({ ...configuration, storage: storageDirectory })) as Server;
    return server;
}

export type RegistryDetails = {
    readonly registryAddress: string;
    readonly storageDirectory: string;
    readonly token: string;
    readonly username: string;
    readonly password: string;
};

async function startRegistry(server: Server, storageDirectory: string): Promise<RegistryDetails> {
    const port = await getPort();
    const registryAddress = `http://127.0.0.1:${port}`;
    const credentials = `${username}:${password}`;

    await startServer(server, port);
    const response = await fetch(`${registryAddress}/-/user/org.couchdb.user:${username}`, {
        method: 'PUT',
        body: JSON.stringify({
            name: username,
            password
        }),
        headers: { 'content-type': 'application/json', Authorization: `Basic ${btoa(credentials)}` }
    });
    const body = (await response.json()) as Record<string, string>;

    const { token } = body;

    if (token === undefined) {
        throw new Error('Couldn’t create a token');
    }

    return { registryAddress, storageDirectory, token, username, password };
}

export function checkWithRegistry(
    callback: (registryDetails: RegistryDetails) => Promise<void>
): AsynchronousTestFunction {
    return async function () {
        const storageDirectory = await createTemporaryDirectory();
        const server = await createRegistryServer(storageDirectory);
        try {
            const registryDetails = await startRegistry(server, storageDirectory);
            await callback(registryDetails);
        } finally {
            try {
                await stopServer(server);
            } finally {
                await fileSystem.rm(storageDirectory, { recursive: true, force: true });
            }
        }
    };
}

export function checkWithBasicAuthenticationRegistry(
    run: (registryDetails: RegistryDetails) => Promise<void>
): AsynchronousTestFunction {
    return checkWithRegistry(async function (registryDetails) {
        const credentials = `${registryDetails.username}:${registryDetails.password}`;
        const authorization = `Basic ${btoa(credentials)}`;
        const publicationCredentials: (string | undefined)[] = [];
        await withRegistryServer(function (request, response) {
            if (request.method === 'PUT') {
                publicationCredentials.push(request.headers.authorization);
                if (request.headers.authorization !== authorization) {
                    response.writeHead(401, { 'www-authenticate': 'Basic' });
                    response.end();
                    return;
                }
            }
            const registryRequestAddress = new URL(request.url ?? '/', registryDetails.registryAddress);
            const forwardedRequest = requestRegistry(registryRequestAddress, {
                method: request.method,
                headers: {
                    authorization: `Bearer ${registryDetails.token}`,
                    host: request.headers.host ?? registryRequestAddress.host,
                    'content-type': request.headers['content-type'] ?? 'application/json'
                }
            }, function (registryResponse) {
                response.writeHead(registryResponse.statusCode ?? 502, registryResponse.headers);
                registryResponse.pipe(response);
            });
            forwardedRequest.once('error', function (error) {
                response.destroy(error);
            });
            request.pipe(forwardedRequest);
        }, async function (registryAddress) {
            await run({ ...registryDetails, registryAddress });
        });
        assert.deepStrictEqual(publicationCredentials, [ authorization ]);
    });
}
