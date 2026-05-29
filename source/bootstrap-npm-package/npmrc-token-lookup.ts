export type NpmrcTokenLookupDependencies = {
    readonly readNpmrc: () => Promise<string | undefined>;
};

export type NpmrcTokenLookup = {
    readonly findToken: (registryUrl: string) => Promise<string | undefined>;
};

function buildNerfDart(registryUrl: string): string {
    const url = new URL(registryUrl);
    const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    return `//${url.host}${pathname}`;
}

function parseTokenLine(line: string, nerfDart: string): string | undefined {
    const trimmed = line.trim();
    const tokenKey = `${nerfDart}:_authToken=`;
    if (!trimmed.startsWith(tokenKey)) {
        return undefined;
    }
    const rawValue = trimmed.slice(tokenKey.length).trim();
    const unquoted = rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue;
    return unquoted.length === 0 ? undefined : unquoted;
}

function findTokenInContent(content: string, registryUrl: string): string | undefined {
    const nerfDart = buildNerfDart(registryUrl);
    for (const line of content.split('\n')) {
        const token = parseTokenLine(line, nerfDart);
        if (token !== undefined) {
            return token;
        }
    }
    return undefined;
}

export function createNpmrcTokenLookup(dependencies: Readonly<NpmrcTokenLookupDependencies>): NpmrcTokenLookup {
    const { readNpmrc } = dependencies;

    return {
        async findToken(registryUrl) {
            const content = await readNpmrc();
            if (content === undefined) {
                return undefined;
            }
            return findTokenInContent(content, registryUrl);
        }
    };
}
