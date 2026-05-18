import { ts as typescript } from 'ts-morph';
import { isCodeFile } from '../../common/code-files.ts';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';

function isHashSpecifier(specifier: string): boolean {
    return specifier.startsWith('#');
}

export function collectHashImportSpecifiers(bundle: Pick<AnalyzedBundle, 'contents'>): ReadonlySet<string> {
    const importSpecifiers = new Set<string>();

    for (const resource of bundle.contents) {
        const { targetFilePath, content } = resource.fileDescription;
        if (isCodeFile(targetFilePath)) {
            const parsedFile = typescript.preProcessFile(content, true);
            for (const literal of parsedFile.importedFiles) {
                if (isHashSpecifier(literal.fileName)) {
                    importSpecifiers.add(literal.fileName);
                }
            }
        }
    }

    return importSpecifiers;
}
