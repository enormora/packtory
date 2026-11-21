import path from 'node:path';
import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';

function declarationExtensions(): readonly string[] {
    return [ '.d.ts', '.d.mts', '.d.cts' ];
}

export function isDeclarationPath(filePath: string): boolean {
    return declarationExtensions().some(function (extension) {
        return filePath.endsWith(extension);
    });
}

export function isRelativeSpecifier(specifier: string): boolean {
    return specifier.startsWith('./') || specifier.startsWith('../');
}

function declarationCandidatesForExtensionlessPath(resolvedPath: string): readonly string[] {
    const extensions = declarationExtensions();
    return [
        resolvedPath,
        ...extensions.map(function (declarationExtension) {
            return `${resolvedPath}${declarationExtension}`;
        }),
        ...extensions.map(function (declarationExtension) {
            return `${resolvedPath}/index${declarationExtension}`;
        })
    ];
}

export function declarationCandidatesFor(importerPath: string, specifier: string): readonly string[] {
    const resolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
    const companions = declarationCompanionCandidates(resolvedPath);
    return companions.length === 0 ? declarationCandidatesForExtensionlessPath(resolvedPath) : companions;
}
