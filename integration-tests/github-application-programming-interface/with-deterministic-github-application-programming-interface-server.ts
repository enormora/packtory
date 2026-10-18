import type { AsyncFunc as MochaAsynchronousTestFunction } from 'mocha';
import getPort from 'get-port';
import {
    createDeterministicGitHubApplicationProgrammingInterfaceServer
} from './deterministic-github-application-programming-interface-server.ts';
import type {
    DeterministicGitHubApplicationProgrammingInterfaceRequest,
    DeterministicGitHubApplicationProgrammingInterfaceScenario
} from './deterministic-github-application-programming-interface-scenarios.ts';

export type DeterministicGitHubApplicationProgrammingInterfaceServerContext = {
    readonly baseAddress: string;
    readonly graphqlAddress: string;
    readonly requests: () => readonly DeterministicGitHubApplicationProgrammingInterfaceRequest[];
};

type DeterministicGitHubApplicationProgrammingInterfaceServerTest = (
    context: DeterministicGitHubApplicationProgrammingInterfaceServerContext
) => Promise<void>;

export function withDeterministicGitHubApplicationProgrammingInterfaceServer(
    scenario: DeterministicGitHubApplicationProgrammingInterfaceScenario,
    testFunction: DeterministicGitHubApplicationProgrammingInterfaceServerTest
): MochaAsynchronousTestFunction {
    return async function executeTestWithServer() {
        const server = await createDeterministicGitHubApplicationProgrammingInterfaceServer({
            port: await getPort(),
            scenario
        });

        try {
            await testFunction({
                baseAddress: server.baseAddress,
                graphqlAddress: server.graphqlAddress,
                requests: server.requests
            });
        } finally {
            await server.stop();
        }
    };
}
