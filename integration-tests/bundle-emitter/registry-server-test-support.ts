import assert from 'node:assert';
import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';

export async function withRegistryServer(
    handleRequest: RequestListener,
    run: (registryAddress: string) => Promise<void>
): Promise<void> {
    const server = createServer(handleRequest);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address !== null && typeof address === 'object');
    try {
        await run(`http://127.0.0.1:${address.port}/`);
    } finally {
        server.closeAllConnections();
        await new Promise<void>(function (resolve, reject) {
            server.close(function (error) {
                if (error !== undefined) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}
