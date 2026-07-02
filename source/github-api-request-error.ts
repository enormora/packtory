function readReflectedProperty(value: unknown, property: string): unknown {
    return Reflect.get(new Object(value), property) as unknown;
}

function createGitHubRequestError(error: unknown): Error {
    const requestUrl = String(readReflectedProperty(readReflectedProperty(error, 'request'), 'url'));
    const status = String(readReflectedProperty(error, 'status'));
    const parsedUrl = new URL(requestUrl);
    return new Error(`GitHub API request failed (${status}) for ${parsedUrl.pathname}${parsedUrl.search}`, {
        cause: error
    });
}

export async function resolveGitHubResponse<T>(request: Promise<T>): Promise<T> {
    try {
        return await request;
    } catch (error) {
        throw createGitHubRequestError(error);
    }
}
