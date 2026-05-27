import npa from 'npm-package-arg';

const mutableNpaType = {
    directory: 'directory',
    file: 'file',
    git: 'git',
    remote: 'remote'
} as const;

const specifierClassificationKind = {
    malformed: 'malformed',
    mutable: 'mutable',
    registry: 'registry'
} as const;

export type MutableNpaType = (typeof mutableNpaType)[keyof typeof mutableNpaType];

export type Classification =
    | { readonly kind: typeof specifierClassificationKind.malformed; readonly reason: string }
    | { readonly kind: typeof specifierClassificationKind.mutable; readonly npaType: MutableNpaType }
    | { readonly kind: typeof specifierClassificationKind.registry };

const mutableNpaTypeByResultType = {
    file: mutableNpaType.file,
    git: mutableNpaType.git,
    remote: mutableNpaType.remote
} as const satisfies Readonly<
    Record<
        Exclude<MutableNpaType, typeof mutableNpaType.directory>,
        Exclude<MutableNpaType, typeof mutableNpaType.directory>
    >
>;
const registryNpaTypeLookup = {
    alias: true,
    range: true,
    tag: true,
    version: true
} as const;

function workspaceMalformedReason(): string {
    return (
        'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace,' +
        ' not valid in a published manifest'
    );
}

function portalMalformedReason(): string {
    return 'portal protocol is yarn-specific; resolved as a local symlink, not valid in a published manifest';
}

function isKnownMutableNpaType(type: string): type is keyof typeof mutableNpaTypeByResultType {
    return type in mutableNpaTypeByResultType;
}

function classifyNpaResult(result: npa.Result): Classification {
    if (result.type in registryNpaTypeLookup) {
        return { kind: specifierClassificationKind.registry };
    }

    const npaType = isKnownMutableNpaType(result.type)
        ? mutableNpaTypeByResultType[result.type]
        : mutableNpaType.directory;

    return {
        kind: specifierClassificationKind.mutable,
        npaType
    };
}

export function classifySpecifier(name: string, specifier: string): Classification {
    if (specifier.startsWith('workspace:')) {
        return { kind: specifierClassificationKind.malformed, reason: workspaceMalformedReason() };
    }
    if (specifier.startsWith('portal:')) {
        return { kind: specifierClassificationKind.malformed, reason: portalMalformedReason() };
    }

    try {
        const result = npa.resolve(name, specifier);
        return classifyNpaResult(result);
    } catch (error: unknown) {
        return { kind: specifierClassificationKind.malformed, reason: String(error) };
    }
}
