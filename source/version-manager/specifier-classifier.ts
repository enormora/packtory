import npa from 'npm-package-arg';

const workspaceProtocolPrefix = 'workspace:';
const portalProtocolPrefix = 'portal:';

const workspaceMalformedReason =
    'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace,' +
    ' not valid in a published manifest';
const portalMalformedReason =
    'portal protocol is yarn-specific; resolved as a local symlink, not valid in a published manifest';

export type MutableNpaType = 'directory' | 'file' | 'git' | 'remote';

export type Classification =
    | { readonly kind: 'malformed'; readonly reason: string }
    | { readonly kind: 'mutable'; readonly npaType: MutableNpaType }
    | { readonly kind: 'registry' };

type NpaResultType = npa.Result['type'];

const registryNpaTypes = new Set<NpaResultType>(['alias', 'version', 'range', 'tag']);

function classifyNpaResult(result: npa.Result): Classification {
    if (registryNpaTypes.has(result.type)) {
        return { kind: 'registry' };
    }

    if (result.type === 'git') {
        return { kind: 'mutable', npaType: 'git' };
    }
    if (result.type === 'remote') {
        return { kind: 'mutable', npaType: 'remote' };
    }
    if (result.type === 'file') {
        return { kind: 'mutable', npaType: 'file' };
    }

    return { kind: 'mutable', npaType: 'directory' };
}

export function classifySpecifier(name: string, specifier: string): Classification {
    if (specifier.startsWith(workspaceProtocolPrefix)) {
        return { kind: 'malformed', reason: workspaceMalformedReason };
    }
    if (specifier.startsWith(portalProtocolPrefix)) {
        return { kind: 'malformed', reason: portalMalformedReason };
    }

    try {
        const result = npa.resolve(name, specifier);
        return classifyNpaResult(result);
    } catch (error: unknown) {
        return { kind: 'malformed', reason: String(error) };
    }
}
