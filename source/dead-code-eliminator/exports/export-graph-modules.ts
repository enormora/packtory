import { Node as TypeScriptMorphNode, SyntaxKind, type SourceFile, type ExportDeclaration } from 'ts-morph';
import { isDefined } from 'remeda';
import { moduleExportDependencies, type ModuleExportLinks } from './module-export-dependencies.ts';
import { moduleEvaluationDependencies, type ModuleGraphTargets } from './module-evaluation-dependencies.ts';
import type { ModuleGraphAnalysis, ModuleGraphRecord } from './module-graph-analysis.ts';
import { resolveImportedExport } from './module-export-resolver.ts';
import { resolveNamespaceImport } from './namespace-export-value.ts';

type GraphNodes = Pick<Map<string, () => readonly string[]>, 'set'> & ReadonlyMap<string, () => readonly string[]>;
type GraphTargets = ModuleGraphTargets & Pick<ModuleExportLinks, 'namespaceTargets'>;
export type GraphModule = {
    readonly record: ModuleGraphRecord;
    readonly exported: (name: string) => string;
    readonly evaluated: () => string;
    readonly binding: (name: string) => string | undefined;
    readonly namespaceTargets: (properties: ReadonlySet<string> | undefined) => readonly string[];
};
export type ExportGraphModules = {
    readonly modules: ReadonlyMap<SourceFile | undefined, GraphModule>;
    readonly nodes: ReadonlyMap<string, () => readonly string[]>;
    readonly targets: GraphTargets;
    readonly materialize: () => void;
    readonly importedTargets: (declaration: TypeScriptMorphNode) => readonly string[] | undefined;
    readonly namespaceBindingTargets: (declaration: TypeScriptMorphNode) => readonly string[];
    readonly declarationTargets: (declaration: ExportDeclaration) => readonly string[] | undefined;
};

function typeOnlyBinding(declaration: TypeScriptMorphNode): boolean {
    return declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)?.isTypeOnly() === true ||
        TypeScriptMorphNode.isImportSpecifier(declaration) && declaration.isTypeOnly();
}

function isRuntimeExportDeclaration(declaration: ExportDeclaration): boolean {
    return !declaration.getSourceFile().isDeclarationFile() && !declaration.isTypeOnly() &&
        declaration.getNamedExports().every(function (specifier) {
            return !specifier.isTypeOnly();
        });
}

function createGraphModule(
    record: ModuleGraphRecord,
    analysis: ModuleGraphAnalysis,
    nodes: GraphNodes,
    targets: GraphTargets
): GraphModule {
    const { source } = record.model;
    function exported(name: string): string {
        const key = `${record.file.targetFilePath}::@export:${JSON.stringify(name)}`;
        if (!nodes.has(key)) {
            nodes.set(key, function () {
                return moduleExportDependencies(record.model, name, {
                    ...targets,
                    resolveModule: analysis.resolveModule,
                    demand: analysis.demand
                });
            });
        }
        return key;
    }
    return {
        record,
        exported,
        evaluated() {
            const key = `${record.file.targetFilePath}::@evaluate`;
            if (!nodes.has(key)) {
                nodes.set(key, function () {
                    return moduleEvaluationDependencies({
                        model: record.model,
                        bindings: record.file.bindings,
                        effects: analysis.effects(source)
                    }, { ...targets, index: analysis.index, resolveModule: analysis.resolveModule });
                });
            }
            return key;
        },
        binding(name) {
            return record.bindingIdentifiers.get(name);
        },
        namespaceTargets(properties) {
            const names = analysis.index.names(source);
            const selected = names ?? analysis.index.candidates(source);
            return Array
                .from(selected)
                .filter(function (name) {
                    return names === undefined || properties === undefined || properties.has(name);
                })
                .map(exported);
        }
    };
}

export function createExportGraphModules(analysis: ModuleGraphAnalysis): ExportGraphModules {
    const nodes: GraphNodes = new Map();
    const modules = new Map<SourceFile | undefined, GraphModule>();
    const targets: GraphTargets = {
        exported(source, name) {
            return modules.get(source)?.exported(name);
        },
        evaluated(source) {
            return modules.get(source)?.evaluated();
        },
        binding(source, name) {
            return modules.get(source)?.binding(name);
        },
        namespaceTargets(source, properties) {
            return modules.get(source)?.namespaceTargets(properties) ?? [];
        }
    };
    analysis.records.forEach(function (record, source) {
        modules.set(source, createGraphModule(record, analysis, nodes, targets));
    });
    return {
        modules,
        nodes,
        targets,
        materialize() {
            nodes.forEach(function (read, key) {
                const neighbors = read();
                nodes.set(key, function () {
                    return neighbors;
                });
            });
        },
        importedTargets(declaration) {
            if (declaration.getSourceFile().isDeclarationFile() || typeOnlyBinding(declaration)) {
                return undefined;
            }
            const request = resolveImportedExport(declaration, analysis.resolveModule);
            if (request === undefined) {
                return undefined;
            }
            return request.name === undefined
                ? []
                : [ targets.exported(request.source, request.name) ].filter(isDefined);
        },
        namespaceBindingTargets(declaration) {
            if (declaration.getSourceFile().isDeclarationFile() || typeOnlyBinding(declaration)) {
                return [];
            }
            const source = resolveNamespaceImport(declaration, analysis.index.models, analysis.resolveModule);
            return modules.get(source)?.namespaceTargets(analysis.demand.properties(declaration)) ?? [];
        },
        declarationTargets(declaration) {
            const module = modules.get(declaration.getSourceFile());
            if (module === undefined || !isRuntimeExportDeclaration(declaration)) {
                return undefined;
            }
            const namespace = declaration.getNamespaceExport();
            if (namespace !== undefined) {
                return [ module.exported(namespace.getName()) ];
            }
            if (declaration.isNamespaceExport()) {
                return module.namespaceTargets(undefined);
            }
            return declaration.getNamedExports().map(function (specifier) {
                return module.exported((specifier.getAliasNode() ?? specifier.getNameNode()).compilerNode.text);
            });
        }
    };
}
