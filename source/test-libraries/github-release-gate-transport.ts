import type { RouteMap } from './github-release-gate-test-support.ts';
import { createJavaScriptObjectNotationFetch } from './release-gate-request-fixtures.ts';

export async function withGitHubTransport<Result>(
    routes: RouteMap,
    run: (address: string, fetch: typeof globalThis.fetch) => Promise<Result>
): Promise<Result> {
    return run('https://api.github.com', createJavaScriptObjectNotationFetch(routes, []));
}
