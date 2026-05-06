import { isBuiltin } from 'node:module';
import { isDefined } from 'remeda';
import { ts, type SourceFile, type StringLiteral } from 'ts-morph';

export function resolveSourceFileForLiteral(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>
): Readonly<SourceFile | undefined> {
    const project = containingSourceFile.getProject();
    const result = ts.resolveModuleName(
        literal.getLiteralValue(),
        containingSourceFile.getFilePath(),
        project.getCompilerOptions(),
        project.getModuleResolutionHost()
    );

    if (result.resolvedModule !== undefined) {
        const resolvedFilePath = result.resolvedModule.resolvedFileName;
        return project.getSourceFile(resolvedFilePath);
    }

    return undefined;
}

export function getReferencedSourceFiles(sourceFile: Readonly<SourceFile>): readonly Readonly<SourceFile>[] {
    const importStringLiterals = sourceFile.getImportStringLiterals();
    return importStringLiterals
        .map((literal) => {
            const referencedSourceFile = resolveSourceFileForLiteral(literal, sourceFile);

            if (referencedSourceFile === undefined) {
                const importValue = literal.getLiteralValue();

                if (isBuiltin(importValue)) {
                    return undefined;
                }

                const message = `Failed to resolve import "${importValue}" in file "${sourceFile.getFilePath()}"`;

                throw new Error(message);
            }

            return referencedSourceFile;
        })
        .filter(isDefined);
}
