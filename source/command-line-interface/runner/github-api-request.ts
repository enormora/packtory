const defaultGitHubApiVersion = '2022-11-28';

function readReflectedProperty(value: unknown, property: string): unknown {
    return Reflect.get(new Object(value), property) as unknown;
}

function readGitHubErrorStatus(error: unknown): number {
    return Number(readReflectedProperty(error, 'status'));
}

function readGitHubErrorPath(error: unknown): string {
    const url = String(readReflectedProperty(readReflectedProperty(error, 'request'), 'url'));
    const parsedUrl = new URL(url);
    return `${parsedUrl.pathname}${parsedUrl.search}`;
}

function createGitHubRequestError(error: unknown): Error {
    return new Error(
        `GitHub API request failed (${String(readGitHubErrorStatus(error))}) for ${readGitHubErrorPath(error)}`,
        {
            cause: error
        }
    );
}

export function createGitHubJsonRequestHeaders(token: string, userAgent: string): Readonly<Record<string, string>> {
    return {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': userAgent,
        'x-github-api-version': defaultGitHubApiVersion
    };
}

export async function resolveOptionalGitHubResponse<T>(
    request: Promise<T>,
    missingStatusCode: number
): Promise<T | undefined> {
    try {
        return await request;
    } catch (error) {
        if (readGitHubErrorStatus(error) === missingStatusCode) {
            return undefined;
        }
        throw createGitHubRequestError(error);
    }
}
