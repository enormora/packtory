import { isBuiltin } from 'node:module';
import type { SourceFile } from 'ts-morph';
import { getModuleReferenceLiterals } from '../dependency-scanner/source-file-references.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';

type ArtifactReferenceContractFile = {
    readonly targetFilePath: string;
    readonly sourceFile: Readonly<SourceFile>;
    readonly moduleReferences: readonly ArtifactModuleReference[];
};

type ArtifactReferenceContract = {
    readonly bundleName: string;
    readonly files: readonly ArtifactReferenceContractFile[];
};

function hasArtifactReference(
    moduleReferences: readonly ArtifactModuleReference[],
    emittedSpecifier: string
): boolean {
    return moduleReferences.some(function (reference) {
        return reference.emittedSpecifier === emittedSpecifier;
    });
}

function missingReferenceIssue(
    bundleName: string,
    file: ArtifactReferenceContractFile,
    emittedSpecifier: string
): string {
    return `${bundleName}: ${file.targetFilePath} is missing artifact module reference for "${emittedSpecifier}"`;
}

function fileIssues(bundleName: string, file: ArtifactReferenceContractFile): readonly string[] {
    return getModuleReferenceLiterals(file.sourceFile).flatMap(function (literal) {
        const emittedSpecifier = literal.getLiteralValue();
        return isBuiltin(emittedSpecifier) || hasArtifactReference(file.moduleReferences, emittedSpecifier)
            ? []
            : [ missingReferenceIssue(bundleName, file, emittedSpecifier) ];
    });
}

export function assertArtifactModuleReferenceContract(input: ArtifactReferenceContract): void {
    const issues = input.files.flatMap(function (file) {
        return fileIssues(input.bundleName, file);
    });
    if (issues.length > 0) {
        throw new Error(`Dead code elimination artifact reference contract failed:\n${issues.join('\n')}`);
    }
}
