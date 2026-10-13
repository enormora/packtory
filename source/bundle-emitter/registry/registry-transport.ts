import type { Clock } from '../../common/clock.ts';
import { createRegistryAgent, type RegistryProxyResolver } from './registry-agent.ts';
import { npmRegistryUrl, type NpmFetchOptions } from './registry-auth-config.ts';

type RegistryRequestOptions = Readonly<Record<string, unknown>>;
type TransportDependencies = {
    readonly resolveProxy: RegistryProxyResolver;
    readonly clock: Clock;
};
type RegistryJsonDependencies = TransportDependencies & {
    readonly npmFetch: (url: string, options: NpmFetchOptions) => Promise<RegistryResponse>;
};
type RegistryResponse = {
    readonly body: unknown;
};

const requestTimeoutMilliseconds = 300_000;
const maximumMetadataBytes = 33_554_432;

function isResponseStream(body: unknown): body is AsyncIterable<unknown> {
    return typeof body === 'object' && body !== null && Reflect.has(body, Symbol.asyncIterator);
}

function assertMetadataChunk(chunk: unknown, receivedBytes: number): asserts chunk is Uint8Array {
    if (!(chunk instanceof Uint8Array)) {
        throw new TypeError('Registry response contains an invalid body chunk');
    }
    if (receivedBytes + chunk.byteLength > maximumMetadataBytes) {
        throw new Error(`Registry metadata exceeds ${maximumMetadataBytes} bytes`);
    }
}

async function readRegistryJson(response: RegistryResponse): Promise<unknown> {
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    if (!isResponseStream(response.body)) {
        throw new Error('Registry response is missing a readable body');
    }
    for await (const chunk of response.body) {
        assertMetadataChunk(chunk, receivedBytes);
        receivedBytes += chunk.byteLength;
        chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks, receivedBytes).toString('utf8')) as unknown;
}

export async function withRegistryTransport<T>(
    dependencies: TransportDependencies,
    options: RegistryRequestOptions,
    request: (options: RegistryRequestOptions) => Promise<T>
): Promise<T> {
    const registry = typeof options.registry === 'string' ? options.registry : npmRegistryUrl;
    const agent = createRegistryAgent(registry, dependencies.resolveProxy);
    const controller = new AbortController();
    const timeout = dependencies.clock.setTimeout(function () {
        controller.abort(new Error(`Registry request exceeded ${requestTimeoutMilliseconds} ms`));
    }, requestTimeoutMilliseconds);
    try {
        return await request({ ...options, agent, signal: controller.signal });
    } catch (error) {
        controller.abort(error);
        throw error;
    } finally {
        dependencies.clock.clearTimeout(timeout);
        agent.destroy();
    }
}

type RegistryJsonFetch = {
    readonly json: (url: string, options: NpmFetchOptions) => Promise<unknown>;
};

export function createRegistryJsonFetch(dependencies: RegistryJsonDependencies): RegistryJsonFetch {
    return {
        async json(url, options) {
            return withRegistryTransport(dependencies, options, async function (requestOptions) {
                return readRegistryJson(await dependencies.npmFetch(url, requestOptions));
            });
        }
    };
}
