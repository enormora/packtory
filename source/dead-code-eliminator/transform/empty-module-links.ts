import { Node as TypeScriptMorphNode, type ExportDeclaration, type ImportDeclaration } from 'ts-morph';
import {
    createSourcePreparation,
    preparationPasses,
    type SourcePreparation
} from '../../source-transformation/source-preparation.ts';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import type { AnalyzedResourceOutput } from '../code-file-analyzer.ts';
import type { LoadedResource } from '../load-resource.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { hasModuleSyntax } from './declaration-removal.ts';
import { sourceReplacement } from './source-replacement.ts';

type PreparedOutput = {
    readonly targetFilePath: string;
    readonly preparation: SourcePreparation;
    readonly moduleReferences: readonly ArtifactModuleReference[];
};

function emptyModule(entry: PreparedOutput): boolean {
    const source = entry.preparation.sourceFile;
    const empty = source.getStatements().every(function (statement) {
        return TypeScriptMorphNode.isEmptyStatement(statement) ||
            TypeScriptMorphNode.isExportDeclaration(statement) && statement.getModuleSpecifierValue() === undefined;
    });
    return hasModuleSyntax(source) && empty && runtimeSourceIsValid(source);
}

function bareRequest(declaration: ExportDeclaration | ImportDeclaration): boolean {
    if (declaration.getAttributes() !== undefined) {
        return false;
    }
    return TypeScriptMorphNode.isImportDeclaration(declaration)
        ? declaration.getImportClause() === undefined
        : declaration.getNamedExports().length === 0 && declaration.getNamespaceExport() === undefined;
}

function removeLinks(entry: PreparedOutput, empty: ReadonlySet<string>): void {
    const { preparation, moduleReferences } = entry;
    const source = preparation.sourceFile;
    const requests = [ ...source.getImportDeclarations(), ...source.getExportDeclarations() ];
    const edits = requests.flatMap(function (declaration) {
        const target = moduleReferences.find(function (reference) {
            return reference.emittedSpecifier === declaration.getModuleSpecifierValue();
        });
        return target?.type === 'local-code' && empty.has(target.targetFilePath) && bareRequest(declaration)
            ? sourceReplacement(declaration, [])
            : [];
    });
    preparation.applyEdits(edits);
    if (edits.length > 0 && !hasModuleSyntax(source)) {
        preparation.applyEdits([ { start: source.getEnd(), end: source.getEnd(), content: '\nexport {};' } ]);
    }
}

export function removeEmptyModuleLinks(
    outputs: readonly AnalyzedResourceOutput[],
    loaded: readonly LoadedResource[]
): readonly AnalyzedResourceOutput[] {
    const prepared = loaded.flatMap(function (entry): readonly PreparedOutput[] {
        return entry.sourceFile === undefined || entry.sourceFile.isDeclarationFile() ? [] : [ {
            targetFilePath: entry.resource.fileDescription.targetFilePath,
            preparation: createSourcePreparation(entry.sourceFile),
            moduleReferences: entry.resource.moduleReferences
        } ];
    });
    const passes = preparationPasses(prepared, function () {
        return JSON.stringify(prepared.map(function (entry) {
            return entry.preparation.sourceFile.getFullText();
        }));
    });
    for (const pass of passes) {
        const empty = new Set(
            pass.filter(emptyModule).map(function (entry) {
                return entry.targetFilePath;
            })
        );
        for (const entry of pass) {
            removeLinks(entry, empty);
        }
    }
    const preparations = new Map(prepared.map(function (entry) {
        return [ entry.targetFilePath, entry.preparation ];
    }));
    return outputs.map(function (output) {
        const preparation = preparations.get(output.resource.fileDescription.targetFilePath);
        return preparation === undefined ? output : {
            resource: {
                ...output.resource,
                fileDescription: { ...output.resource.fileDescription, content: preparation.sourceFile.getFullText() }
            },
            transforms: [
                ...output.transforms,
                ...preparation.transformations.map(function (textTransform) {
                    return { textTransform };
                })
            ]
        };
    });
}
