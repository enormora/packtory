import { Node as TypeScriptMorphNode, type SourceFile, type Statement } from 'ts-morph';
import { isDefined } from 'remeda';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import type { ModuleExportModel } from './module-export-model.ts';
import type { ModuleExportIndex } from './module-export-index.ts';
import { resolveImportedExport, type ExportTargetResolver } from './module-export-resolver.ts';

export type ModuleGraphTargets = {
    readonly binding: (source: SourceFile, name: string) => string | undefined;
    readonly exported: (source: SourceFile | undefined, name: string) => string | undefined;
    readonly evaluated: (source: SourceFile | undefined) => string | undefined;
};

export type ModuleEvaluationInput = {
    readonly model: ModuleExportModel;
    readonly bindings: readonly BindingDescriptor[];
    readonly effects: ReadonlySet<Statement>;
};

export type ModuleEvaluationLinks = ModuleGraphTargets & {
    readonly index: ModuleExportIndex;
    readonly resolveModule: ExportTargetResolver;
};

function staticDependencies(model: ModuleExportModel, links: ModuleEvaluationLinks): readonly string[] {
    return [ ...model.source.getImportDeclarations(), ...model.source.getExportDeclarations() ]
        .filter(function (declaration) {
            return !declaration.isTypeOnly();
        })
        .map(function (declaration) {
            const specifier = declaration.getModuleSpecifierValue();
            return specifier === undefined ? undefined : links.evaluated(links.resolveModule(model.source, specifier));
        })
        .filter(isDefined);
}

function importRequirements(input: ModuleEvaluationInput, links: ModuleEvaluationLinks): readonly string[] {
    return input
        .bindings
        .map(function (descriptor) {
            const request = resolveImportedExport(descriptor.declarationNode, links.resolveModule);
            if (request?.name === undefined) {
                return undefined;
            }
            return links.index.status(request.source, request.name) === 'unique'
                ? undefined
                : links.binding(input.model.source, descriptor.name);
        })
        .filter(isDefined);
}

function exportRequirements(model: ModuleExportModel, links: ModuleEvaluationLinks): readonly string[] {
    const known = links.index.names(model.source) !== undefined;
    return Array
        .from(model.entries)
        .filter(function ([ name, entry ]) {
            return !known || entry.kind === 'forward' && links.index.status(model.source, name) !== 'unique';
        })
        .map(function ([ name ]) {
            return links.exported(model.source, name);
        })
        .filter(isDefined);
}

function isDefaultExport(statement: Statement): boolean {
    if (TypeScriptMorphNode.isExportAssignment(statement)) {
        return true;
    }
    return (TypeScriptMorphNode.isFunctionDeclaration(statement) ||
        TypeScriptMorphNode.isClassDeclaration(statement)) &&
        statement.isDefaultExport();
}

export function moduleEvaluationDependencies(
    input: ModuleEvaluationInput,
    links: ModuleEvaluationLinks
): readonly string[] {
    const defaults = Array
        .from(input.effects)
        .filter(isDefaultExport)
        .map(function () {
            return links.exported(input.model.source, 'default');
        })
        .filter(isDefined);
    return [
        ...staticDependencies(input.model, links),
        ...importRequirements(input, links),
        ...exportRequirements(input.model, links),
        ...defaults
    ];
}
