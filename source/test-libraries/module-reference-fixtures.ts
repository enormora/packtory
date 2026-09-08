import path from 'node:path';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import { getModuleReferenceLiterals } from '../dependency-scanner/source-file-references.ts';
import { createProject } from './typescript-project.ts';

const codeTargetPattern = /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx)$/u;

function externalPackageName(specifier: string): string {
    if (specifier.startsWith('@')) {
        const [ scope, packageName ] = specifier.split('/', 2);
        return `${scope}/${packageName}`;
    }
    return specifier.split('/', 1)[0] ?? specifier;
}

function localTargetFilePath(importerTargetFilePath: string, specifier: string): string {
    const unresolved = path.posix.isAbsolute(specifier)
        ? specifier.slice(1)
        : path.posix.join(path.posix.dirname(importerTargetFilePath), specifier);
    const resolved = path.posix.normalize(unresolved);
    if (importerTargetFilePath.endsWith('.d.ts') && resolved.endsWith('.js')) {
        return resolved.replace(/\.js$/u, '.d.ts');
    }
    return path.posix.extname(resolved) === '' ? `${resolved}.js` : resolved;
}

function moduleReference(importerTargetFilePath: string, specifier: string): ArtifactModuleReference {
    if (specifier.startsWith('.') || path.posix.isAbsolute(specifier)) {
        return {
            type: 'local-code',
            sourceSpecifier: specifier,
            emittedSpecifier: specifier,
            targetFilePath: localTargetFilePath(importerTargetFilePath, specifier)
        };
    }
    return {
        type: 'external-package',
        packageName: externalPackageName(specifier),
        sourceSpecifier: specifier,
        emittedSpecifier: specifier
    };
}

export function inferredModuleReferences(
    inputFilePath: string,
    targetFilePath: string,
    content: string
): readonly ArtifactModuleReference[] {
    if (!codeTargetPattern.test(targetFilePath)) {
        return [];
    }
    const project = createProject({ withFiles: [ { filePath: inputFilePath, content } ] });
    const sourceFile = project.getSourceFileOrThrow(inputFilePath);
    return getModuleReferenceLiterals(sourceFile).flatMap(function (literal) {
        if (literal.getLiteralValue().startsWith('#')) {
            return [];
        }
        return moduleReference(targetFilePath, literal.getLiteralValue());
    });
}
