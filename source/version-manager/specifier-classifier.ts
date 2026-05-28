import npa from 'npm-package-arg';
import { match } from 'ts-pattern';

export type MutableNpaType = 'directory' | 'file' | 'git' | 'remote';

export type Classification =
    | { readonly kind: 'malformed'; readonly reason: string }
    | { readonly kind: 'mutable'; readonly npaType: MutableNpaType }
    | { readonly kind: 'registry' };

type NpaResultType = npa.Result['type'];

function workspaceMalformedReason(): string {
    return (
        'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace,' +
        ' not valid in a published manifest'
    );
}

function portalMalformedReason(): string {
    return 'portal protocol is yarn-specific; resolved as a local symlink, not valid in a published manifest';
}

function classifyNpaResult(result: npa.Result): Classification {
    return match<NpaResultType, Classification>(result.type)
        .with('alias', 'range', 'tag', 'version', () => {
            return { kind: 'registry' };
        })
        .with('git', () => {
            return { kind: 'mutable', npaType: 'git' };
        })
        .with('remote', () => {
            return { kind: 'mutable', npaType: 'remote' };
        })
        .with('file', () => {
            return { kind: 'mutable', npaType: 'file' };
        })
        .otherwise(() => {
            return { kind: 'mutable', npaType: 'directory' };
        });
}

export function classifySpecifier(name: string, specifier: string): Classification {
    if (specifier.startsWith('workspace:')) {
        return { kind: 'malformed', reason: workspaceMalformedReason() };
    }
    if (specifier.startsWith('portal:')) {
        return { kind: 'malformed', reason: portalMalformedReason() };
    }

    try {
        const result = npa.resolve(name, specifier);
        return classifyNpaResult(result);
    } catch (error: unknown) {
        return { kind: 'malformed', reason: String(error) };
    }
}
