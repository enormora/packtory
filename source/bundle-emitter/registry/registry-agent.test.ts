import assert from 'node:assert';
import { ClientRequest } from 'node:http';
import { suite, test } from 'mocha';
import { createStubInstance } from 'sinon';
import { createRegistryAgent } from './registry-agent.ts';

const request = createStubInstance(ClientRequest);
const insecureProtocol = 'http:';

suite('registry destination policy', function () {
    for (
        const destination of [
            `${insecureProtocol}//registry.test/package`,
            'https://other.test/package',
            'https://registry.test:444/package'
        ]
    ) {
        test(`rejects ${destination} before resolving its proxy`, async function () {
            const proxyRequests: string[] = [];
            const agent = createRegistryAgent('https://registry.test/', function (url) {
                proxyRequests.push(url);
                return 'https://proxy.test';
            });
            try {
                await assert.rejects(async function () {
                    return agent.getProxyForUrl(destination, request);
                }, /differs from the configured registry origin/u);
                assert.deepStrictEqual(proxyRequests, []);
            } finally {
                agent.destroy();
            }
        });
    }

    test('normalizes the default port and resolves the proxy for the full request URL', function () {
        const proxyRequests: string[] = [];
        const agent = createRegistryAgent('https://registry.test:443/base/', function (url) {
            proxyRequests.push(url);
            return 'https://proxy.test';
        });
        try {
            assert.strictEqual(agent.getProxyForUrl('https://registry.test/package', request), 'https://proxy.test');
            assert.deepStrictEqual(proxyRequests, [ 'https://registry.test/package' ]);
        } finally {
            agent.destroy();
        }
    });
});
