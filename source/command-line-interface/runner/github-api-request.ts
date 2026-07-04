function defaultGitHubApiVersion(): string {
    return '2022-11-28';
}

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

function readStringProperty(value: unknown, property: string): string | undefined {
    const propertyValue = readReflectedProperty(value, property);
    return typeof propertyValue === 'string' && propertyValue.length > 0 ? propertyValue : undefined;
}

function readGitHubErrorMessages(value: unknown): readonly (string | undefined)[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map(function (item) {
        return readStringProperty(item, 'message');
    });
}

function uniqueMessages(messages: readonly (string | undefined)[]): readonly string[] {
    return Array.from(
        new Set(
            messages.filter(function (message): message is string {
                return message !== undefined;
            })
        )
    );
}

function readGitHubErrorDetails(error: unknown): readonly string[] {
    const response = readReflectedProperty(error, 'response');
    const responseData = readReflectedProperty(response, 'data');
    return uniqueMessages([
        readStringProperty(error, 'message'),
        readStringProperty(responseData, 'message'),
        ...readGitHubErrorMessages(readReflectedProperty(error, 'errors')),
        ...readGitHubErrorMessages(readReflectedProperty(response, 'errors')),
        ...readGitHubErrorMessages(readReflectedProperty(responseData, 'errors'))
    ]);
}

function createGitHubRequestError(error: unknown): Error {
    const details = readGitHubErrorDetails(error);
    const detailText = details.length === 0 ? '' : `: ${details.join('; ')}`;
    return new Error(
        `GitHub API request failed (${String(readGitHubErrorStatus(error))}) for ${
            readGitHubErrorPath(error)
        }${detailText}`,
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
        'x-github-api-version': defaultGitHubApiVersion()
    };
}

export async function resolveGitHubResponse<T>(request: Promise<T>): Promise<T> {
    try {
        return await request;
    } catch (error) {
        throw createGitHubRequestError(error);
    }
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
