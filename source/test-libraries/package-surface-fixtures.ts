import type { BundleLike, RootFileDescription } from '../package-surface/package-shape.ts';

export type RootContentOverrides = {
    readonly content?: string;
    readonly isExecutable?: boolean;
};

export function rootWithSource(
    inputFilePath: string,
    targetFilePath: string,
    overrides: RootContentOverrides = {}
): RootFileDescription {
    return {
        javaScript: {
            inputFilePath,
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
    javaScriptSource: string,
    javaScriptTarget: string,
    declarationSource: string,
    declarationTarget: string
): RootFileDescription {
    return {
        javaScript: {
            inputFilePath: javaScriptSource,
            targetFilePath: javaScriptTarget,
            content: '',
            isExecutable: false
        },
        declarationFile: { inputFilePath: declarationSource, targetFilePath: declarationTarget }
    };
}

export function content(inputFilePath: string, targetFilePath: string): BundleLike['contents'][number] {
    return { fileDescription: { inputFilePath, targetFilePath } };
}
