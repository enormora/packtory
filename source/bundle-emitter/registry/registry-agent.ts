import { ProxyAgent } from 'proxy-agent';

export type RegistryProxyResolver = (address: string) => string;

export function createRegistryAgent(registry: string, resolveProxy: RegistryProxyResolver): ProxyAgent {
    const registryAddress = new URL(registry);
    return new ProxyAgent({
        getProxyForUrl(address) {
            const destination = new URL(address);
            if (destination.origin !== registryAddress.origin) {
                throw new Error('Registry request destination differs from the configured registry origin');
            }
            return resolveProxy(address);
        }
    });
}
