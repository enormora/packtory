import npa from 'npm-package-arg';
import { match } from 'ts-pattern';

export type MutableNpaType = 'directory' | 'file' | 'git' | 'remote';

type MalformedClassification = { readonly kind: 'malformed'; readonly reason: string; };
type MutableClassification = { readonly kind: 'mutable'; readonly npaType: MutableNpaType; };
type RegistryClassification = { readonly kind: 'registry'; };
type Classifications = readonly [
    MalformedClassification,
    MutableClassification,
    RegistryClassification
];

export type Classification = Classifications[number];

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

function classifyNpaResult(result: Readonly<npa.Result>): Classification {
    return match<NpaResultType, Classification>(result.type)
        .with('alias', 'range', 'tag', 'version', function () {
            return { kind: 'registry' };
        })
        .with('git', function () {
            return { kind: 'mutable', npaType: 'git' };
        })
        .with('remote', function () {
            return { kind: 'mutable', npaType: 'remote' };
        })
        .with('file', function () {
            return { kind: 'mutable', npaType: 'file' };
        })
        .otherwise(function () {
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
