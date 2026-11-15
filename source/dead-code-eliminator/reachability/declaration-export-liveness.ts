import { buildDeclarationNodeIndex, type FileBindings } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';

export function survivingDeclarationExports(
    files: readonly FileBindings[],
    reachable: ReadonlySet<string>
): ReadonlyMap<string, ReadonlySet<string>> {
    const declarations = files.filter(function (file) {
        return file.sourceFile.isDeclarationFile();
    });
    const declarationIndex = buildDeclarationNodeIndex(declarations);
    return new Map(declarations.map(function (file) {
        const surviving = new Set(file.sourceFile.getExportSymbols().map(function (symbol) {
            return symbol.getName();
        }));
        for (const declaration of file.sourceFile.getExportDeclarations()) {
            for (const specifier of declaration.getNamedExports()) {
                const targets = collectIdentifierTargets(specifier, declarationIndex, undefined);
                if (targets.size > 0 && targets.isDisjointFrom(reachable)) {
                    surviving.delete((specifier.getAliasNode() ?? specifier.getNameNode()).compilerNode.text);
                }
            }
        }
        return [ file.targetFilePath, surviving ] as const;
    }));
}
