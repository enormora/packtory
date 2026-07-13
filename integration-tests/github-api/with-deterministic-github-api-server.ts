import type { AsyncFunc as MochaAsyncTestFunction } from 'mocha';
import getPort from 'get-port';
import {
    createDeterministicGitHubApiServer,
    type DeterministicGitHubApiRequest
} from './deterministic-github-api-server.ts';
import type { DeterministicGitHubApiScenario } from './deterministic-github-api-scenarios.ts';

export type DeterministicGitHubApiServerContext = {
    readonly baseUrl: string;
    readonly graphqlUrl: string;
    readonly requests: () => readonly DeterministicGitHubApiRequest[];
};

type DeterministicGitHubApiServerTest = (context: DeterministicGitHubApiServerContext) => Promise<void>;

export function withDeterministicGitHubApiServer(
    scenario: DeterministicGitHubApiScenario,
    testFunction: DeterministicGitHubApiServerTest
): MochaAsyncTestFunction {
    return async function executeTestWithServer() {
        const server = await createDeterministicGitHubApiServer({
            port: await getPort(),
            scenario
        });

        try {
            await testFunction({
                baseUrl: server.baseUrl,
                graphqlUrl: server.graphqlUrl,
                requests: server.requests
            });
        } finally {
            await server.stop();
        }
    };
}
