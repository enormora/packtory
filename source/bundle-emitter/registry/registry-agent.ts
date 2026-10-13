import { ProxyAgent } from 'proxy-agent';

export type RegistryProxyResolver = (url: string) => string;

export function createRegistryAgent(registry: string, resolveProxy: RegistryProxyResolver): ProxyAgent {
    const registryUrl = new URL(registry);
    return new ProxyAgent({
        getProxyForUrl(url) {
            const destination = new URL(url);
            if (destination.origin !== registryUrl.origin) {
                throw new Error('Registry request destination differs from the configured registry origin');
            }
            return resolveProxy(url);
        }
    });
}
