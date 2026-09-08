import path from 'node:path';
import type { Project } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import { packageManifestFilePath } from '../common/package-layout.ts';
import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { LocalFile } from '../dependency-scanner/dependency-graph.ts';
import { moduleReferenceKind, type ModuleReference } from '../dependency-scanner/source-file-references.ts';
import type { ArtifactModuleReference } from './resolved-bundle.ts';

function prependSourcesFolderIfNecessary(sourcesFolder: string, filePath: string): string {
    if (!path.isAbsolute(filePath)) {
        return path.join(sourcesFolder, filePath);
    }

    return filePath;
}

function rejectCodeFile(targetFilePath: string): void {
    if (isCodeFile(targetFilePath)) {
        const errorMessage = [
            `additionalFiles must not include code files; received "${targetFilePath}".`,
            'Code that should ship in the bundle must be reachable from a root so',
            'dependency, side-effect and dead-code analyses can run on it.',
            'If you intend to ship code as a static asset (e.g. a template),',
            'use a non-code extension like .txt.'
        ]
            .join(' ');
        throw new Error(errorMessage);
    }
}

function rejectGeneratedManifestTarget(targetFilePath: string): void {
    if (targetFilePath === packageManifestFilePath) {
        throw new Error(`additionalFiles must not target generated package manifest "${packageManifestFilePath}".`);
    }
}

function rejectAdditionalFileTarget(targetFilePath: string): void {
    rejectGeneratedManifestTarget(targetFilePath);
    rejectCodeFile(targetFilePath);
}

type ResolvedBundleFile = {
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly directDependencies: ReadonlySet<string>;
    readonly moduleReferences: readonly ArtifactModuleReference[];
    readonly project?: Project | undefined;
    readonly isExplicitlyIncluded: boolean;
    readonly isGeneratedManifest?: true | undefined;
};

function toSourceRelativeTargetPath(sourcesFolder: string, filePath: string): string {
    const targetFilePath = path.relative(sourcesFolder, filePath);
    if (
        targetFilePath === packageManifestFilePath ||
        targetFilePath.startsWith('..') ||
        path.isAbsolute(targetFilePath) ||
        targetFilePath.length === 0
    ) {
        throw new Error(`Local file "${filePath}" must resolve to a valid bundle target inside "${sourcesFolder}"`);
    }

    return targetFilePath;
}

function targetPathForLocalFile(sourcesFolder: string, localFile: LocalFile): string {
    return localFile.isGeneratedManifest
        ? packageManifestFilePath
        : toSourceRelativeTargetPath(sourcesFolder, localFile.filePath);
}

function targetPathByInputPathFor(
    sourcesFolder: string,
    localDependencies: readonly LocalFile[]
): ReadonlyMap<string, string> {
    return new Map(
        localDependencies.map(function (localFile) {
            return [ localFile.filePath, targetPathForLocalFile(sourcesFolder, localFile) ];
        })
    );
}

function requireTargetPath(
    targetPathByInputPath: ReadonlyMap<string, string>,
    inputFilePath: string
): string {
    const targetFilePath = targetPathByInputPath.get(inputFilePath);
    if (targetFilePath === undefined) {
        throw new Error(`Resolved local reference "${inputFilePath}" is missing from bundle contents`);
    }
    return targetFilePath;
}

function localArtifactReference(
    type: 'generated-manifest' | 'local-asset' | 'local-code',
    reference: Extract<ModuleReference, { readonly kind: 'generated-manifest' | 'local-asset' | 'local-code'; }>,
    targetPathByInputPath: ReadonlyMap<string, string>
): ArtifactModuleReference {
    return {
        type,
        sourceSpecifier: reference.sourceSpecifier,
        emittedSpecifier: reference.emittedSpecifier,
        targetFilePath: requireTargetPath(targetPathByInputPath, reference.filePath)
    };
}

function artifactModuleReference(
    reference: ModuleReference,
    targetPathByInputPath: ReadonlyMap<string, string>
): ArtifactModuleReference {
    if (reference.kind === moduleReferenceKind.externalPackage) {
        return {
            type: 'external-package',
            sourceSpecifier: reference.sourceSpecifier,
            emittedSpecifier: reference.emittedSpecifier,
            packageName: reference.packageName
        };
    }
    if (reference.kind === moduleReferenceKind.generatedManifest) {
        return localArtifactReference('generated-manifest', reference, targetPathByInputPath);
    }
    if (reference.kind === moduleReferenceKind.localAsset) {
        return localArtifactReference('local-asset', reference, targetPathByInputPath);
    }
    return localArtifactReference('local-code', reference, targetPathByInputPath);
}

function artifactModuleReferences(
    references: readonly ModuleReference[],
    targetPathByInputPath: ReadonlyMap<string, string>
): readonly ArtifactModuleReference[] {
    return references.map(function (reference) {
        return artifactModuleReference(reference, targetPathByInputPath);
    });
}

function directDependencyTargets(
    localFile: LocalFile,
    targetPathByInputPath: ReadonlyMap<string, string>
): ReadonlySet<string> {
    return new Set(
        Array.from(localFile.directDependencies, function (inputFilePath) {
            return requireTargetPath(targetPathByInputPath, inputFilePath);
        })
    );
}

export function combineAllBundleFiles(
    sourcesFolder: string,
    localDependencies: readonly LocalFile[],
    additionalFiles: readonly (AdditionalFileDescription | string)[]
): readonly ResolvedBundleFile[] {
    const targetPathByInputPath = targetPathByInputPathFor(sourcesFolder, localDependencies);
    const resolvedLocalFiles = localDependencies.map(function (localFile) {
        const targetFilePath = targetPathForLocalFile(sourcesFolder, localFile);
        const resolvedBundleFile: ResolvedBundleFile = {
            inputFilePath: localFile.filePath,
            targetFilePath,
            directDependencies: directDependencyTargets(localFile, targetPathByInputPath),
            moduleReferences: artifactModuleReferences(localFile.moduleReferences, targetPathByInputPath),
            ...localFile.project === undefined ? {} : { project: localFile.project },
            isExplicitlyIncluded: false,
            ...localFile.isGeneratedManifest ? { isGeneratedManifest: true } : {}
        };
        return resolvedBundleFile;
    });

    const additionalContents = additionalFiles.map(function (additionalFile): ResolvedBundleFile {
        if (typeof additionalFile === 'string') {
            rejectAdditionalFileTarget(additionalFile);
            const inputFilePath = path.join(sourcesFolder, additionalFile);
            const targetFilePath = additionalFile;
            return {
                inputFilePath,
                targetFilePath,
                directDependencies: new Set(),
                moduleReferences: [],
                isExplicitlyIncluded: true
            };
        }

        if (path.isAbsolute(additionalFile.targetFilePath)) {
            throw new Error('The targetFilePath must be relative');
        }
        rejectAdditionalFileTarget(additionalFile.targetFilePath);

        return {
            inputFilePath: prependSourcesFolderIfNecessary(sourcesFolder, additionalFile.inputFilePath),
            targetFilePath: additionalFile.targetFilePath,
            directDependencies: new Set(),
            moduleReferences: [],
            isExplicitlyIncluded: true
        };
    });

    return [ ...resolvedLocalFiles, ...additionalContents ];
}
