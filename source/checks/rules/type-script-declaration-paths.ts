import path from 'node:path';

type KnownDeclarationExtension = {
    readonly javascriptExtension: string;
    readonly declarationExtensions: readonly string[];
};

const declarationExtensions = [ '.d.ts', '.d.mts', '.d.cts' ] as const;

const knownDeclarationExtensions: readonly KnownDeclarationExtension[] = [
    {
        javascriptExtension: '.js',
        declarationExtensions: [ '.d.ts' ]
    },
    {
        javascriptExtension: '.mjs',
        declarationExtensions: [ '.d.mts', '.d.ts' ]
    },
    {
        javascriptExtension: '.cjs',
        declarationExtensions: [ '.d.cts', '.d.ts' ]
    }
];

export function isDeclarationPath(filePath: string): boolean {
    return declarationExtensions.some(function (extension) {
        return filePath.endsWith(extension);
    });
}

export function isRelativeSpecifier(specifier: string): boolean {
    return specifier.startsWith('./') || specifier.startsWith('../');
}

function stripJavascriptExtension(resolvedPath: string, javascriptExtension: string): string {
    return resolvedPath.slice(0, -javascriptExtension.length);
}

function declarationCandidatesForKnownExtension(resolvedPath: string): readonly string[] | undefined {
    const knownExtension = knownDeclarationExtensions.find(function (candidate) {
        return resolvedPath.endsWith(candidate.javascriptExtension);
    });
    if (knownExtension === undefined) {
        return undefined;
    }

    const basePath = stripJavascriptExtension(resolvedPath, knownExtension.javascriptExtension);
    return knownExtension.declarationExtensions.map(function (declarationExtension) {
        return `${basePath}${declarationExtension}`;
    });
}

function declarationCandidatesForExtensionlessPath(resolvedPath: string): readonly string[] {
    return [
        resolvedPath,
        ...declarationExtensions.map(function (declarationExtension) {
            return `${resolvedPath}${declarationExtension}`;
        }),
        ...declarationExtensions.map(function (declarationExtension) {
            return `${resolvedPath}/index${declarationExtension}`;
        })
    ];
}

export function declarationCandidatesFor(importerPath: string, specifier: string): readonly string[] {
    const resolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
    return declarationCandidatesForKnownExtension(resolvedPath) ??
        declarationCandidatesForExtensionlessPath(resolvedPath);
}
