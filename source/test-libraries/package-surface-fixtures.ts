import type { BundleLike, RootFileDescription } from '../package-surface/package-shape.ts';

export type RootContentOverrides = {
    readonly content?: string;
    readonly isExecutable?: boolean;
};

export function rootWithSource(
    sourceFilePath: string,
    targetFilePath: string,
    overrides: RootContentOverrides = {}
): RootFileDescription {
    return {
        js: {
            sourceFilePath,
            targetFilePath,
            content: overrides.content ?? '',
            isExecutable: overrides.isExecutable ?? false
        }
    };
}

export function plainRoot(targetFilePath: string): RootFileDescription {
    return rootWithSource('', targetFilePath);
}

export function shebangRoot(targetFilePath: string): RootFileDescription {
    return rootWithSource('', targetFilePath, { content: '#!/usr/bin/env node\n' });
}

export function executableShebangRoot(targetFilePath: string): RootFileDescription {
    return rootWithSource('', targetFilePath, { content: '#!/usr/bin/env node\n', isExecutable: true });
}

export function rootWithDeclaration(
    jsSource: string,
    jsTarget: string,
    declarationSource: string,
    declarationTarget: string
): RootFileDescription {
    return {
        js: { sourceFilePath: jsSource, targetFilePath: jsTarget, content: '', isExecutable: false },
        declarationFile: { sourceFilePath: declarationSource, targetFilePath: declarationTarget }
    };
}

export function content(sourceFilePath: string, targetFilePath: string): BundleLike['contents'][number] {
    return { fileDescription: { sourceFilePath, targetFilePath } };
}
