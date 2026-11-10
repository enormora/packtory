import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CallExpression,
    type ExportDeclaration,
    type SourceFile
} from 'ts-morph';
import { isDefined } from 'remeda';
import { bindingIdentifier, type FileBindings } from '../reachability/binding-identifier.ts';
import { createWorklist } from '../../common/worklist.ts';
import { createModuleGraphAnalysis, type ExportGraphInput } from './module-graph-analysis.ts';
import { resolveImportedExport } from './module-export-resolver.ts';
import { resolveNamespaceImport } from './namespace-export-value.ts';
import {
    dynamicImportDependencies,
    moduleExportDependencies,
    type ModuleExportLinks
} from './module-export-dependencies.ts';
import { moduleEvaluationDependencies, type ModuleGraphTargets } from './module-evaluation-dependencies.ts';

export type ExportGraph = {
    readonly nodes: ReadonlyMap<string, () => readonly string[]>;
    readonly owns: (source: SourceFile) => boolean;
    readonly roots: () => readonly string[];
    readonly externalTargets: (seeds: ReadonlySet<string>) => readonly string[];
    readonly bindingDependencies: (identifier: string) => readonly string[];
    readonly importedTargets: (declaration: TypeScriptMorphNode) => readonly string[] | undefined;
    readonly namespaceBindingTargets: (declaration: TypeScriptMorphNode) => readonly string[];
    readonly declarationTargets: (declaration: ExportDeclaration) => readonly string[] | undefined;
    readonly dynamicTargets: (call: CallExpression) => readonly string[] | undefined;
    readonly survivingExports: (reachable: ReadonlySet<string>) => ReadonlyMap<string, ReadonlySet<string>>;
};

function exportNodeIdentifier(path: string, name: string): string {
    return `${path}::@export:${JSON.stringify(name)}`;
}

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

function bindingDependencies(identifier: string, nodes: ExportGraph['nodes']): readonly string[] {
    const pending = createWorklist([ identifier ]);
    const visited = new Set([ identifier ]);
    const bindings = new Set<string>();
    for (let current = pending.takeNext(); current !== undefined; current = pending.takeNext()) {
        const neighbors = nodes.get(current);
        if (neighbors === undefined) {
            bindings.add(current);
        } else {
            neighbors().forEach(function (neighbor) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    pending.schedule(neighbor);
                }
            });
        }
    }
    return Array.from(bindings);
}

export function createExportGraph(input: ExportGraphInput): ExportGraph {
    const analysis = createModuleGraphAnalysis(input);
    const state = {
        records: analysis.records,
        nodes: new Map<string, () => readonly string[]>(),
        externalTargets: new Map<string, readonly string[]>()
    };
    const { index, demand, resolveModule } = analysis;
    const targets: ModuleGraphTargets & Pick<ModuleExportLinks, 'namespaceTargets'> = {
        exported(source, name) {
            const record = source === undefined ? undefined : state.records.get(source);
            if (record === undefined) {
                return undefined;
            }
            const key = exportNodeIdentifier(record.file.targetFilePath, name);
            if (!state.nodes.has(key)) {
                state.nodes.set(key, function () {
                    return moduleExportDependencies(record.model, name, { ...targets, resolveModule, demand });
                });
            }
            return key;
        },
        evaluated(source) {
            const record = source === undefined ? undefined : state.records.get(source);
            if (record === undefined) {
                return undefined;
            }
            const key = `${record.file.targetFilePath}::@evaluate`;
            if (!state.nodes.has(key)) {
                state.nodes.set(key, function () {
                    const effects = analysis.effects(record.model.source);
                    return moduleEvaluationDependencies({
                        model: record.model,
                        bindings: record.file.bindings,
                        effects
                    }, { ...targets, index, resolveModule });
                });
            }
            return key;
        },
        binding(source, name) {
            return state.records.get(source)?.bindingIdentifiers.get(name);
        },
        namespaceTargets(source, properties) {
            const names = index.names(source);
            const selected = names ?? index.candidates(source);
            return Array
                .from(selected)
                .filter(function (name) {
                    return names === undefined || properties === undefined || properties.has(name);
                })
                .map(function (name) {
                    return targets.exported(source, name);
                })
                .filter(isDefined);
        }
    };

    function registerModule(file: FileBindings): void {
        const source = file.sourceFile.getSourceFile();
        targets.evaluated(source);
        index.candidates(source).forEach(function (name) {
            const binding = bindingIdentifier(file.targetFilePath, name);
            state.externalTargets.set(
                binding,
                [ targets.evaluated(source), targets.exported(source, name) ]
                    .filter(isDefined)
            );
        });
        file.bindings.forEach(function (descriptor) {
            const request = resolveImportedExport(descriptor.declarationNode, resolveModule);
            if (request?.name !== undefined) {
                targets.exported(request.source, request.name);
            }
        });
        source.getExportDeclarations().forEach(function (declaration) {
            declaration.getNamedExports().forEach(function (specifier) {
                targets.exported(source, (specifier.getAliasNode() ?? specifier.getNameNode()).compilerNode.text);
            });
        });
    }

    state.records.forEach(function (record) {
        registerModule(record.file);
    });
    state.nodes.forEach(function (read, key) {
        const neighbors = read();
        state.nodes.set(key, function () {
            return neighbors;
        });
    });
    return {
        nodes: state.nodes,
        bindingDependencies(identifier) {
            return bindingDependencies(identifier, state.nodes);
        },
        externalTargets(seeds) {
            return Array.from(seeds).flatMap(function (seed) {
                return state.externalTargets.get(seed) ?? [];
            });
        },
        owns(source) {
            return state.records.has(source) && !source.isDeclarationFile();
        },
        roots() {
            return input
                .files
                .filter(function (file) {
                    return input.publicPaths.has(file.targetFilePath);
                })
                .flatMap(function (file) {
                    const source = file.sourceFile.getSourceFile();
                    const names = index.names(source) ?? index.candidates(source);
                    return [
                        targets.evaluated(source),
                        ...Array.from(names, function (name) {
                            return targets.exported(source, name);
                        })
                    ]
                        .filter(isDefined);
                });
        },
        importedTargets(declaration) {
            if (declaration.getSourceFile().isDeclarationFile() || typeOnlyBinding(declaration)) {
                return undefined;
            }
            const request = resolveImportedExport(declaration, resolveModule);
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
            const source = resolveNamespaceImport(declaration, index.models, resolveModule);
            return source === undefined ? [] : targets.namespaceTargets(source, demand.properties(declaration));
        },
        declarationTargets(declaration) {
            const source = declaration.getSourceFile();
            if (!state.records.has(source) || !isRuntimeExportDeclaration(declaration)) {
                return undefined;
            }
            const namespace = declaration.getNamespaceExport();
            if (namespace !== undefined) {
                return [ targets.exported(source, namespace.getName()) ].filter(isDefined);
            }
            if (declaration.isNamespaceExport()) {
                return targets.namespaceTargets(source, undefined);
            }
            return declaration
                .getNamedExports()
                .map(function (specifier) {
                    return targets.exported(
                        source,
                        (specifier.getAliasNode() ?? specifier.getNameNode()).compilerNode.text
                    );
                })
                .filter(isDefined);
        },
        dynamicTargets(call) {
            return dynamicImportDependencies(call, {
                ...targets,
                resolveModule,
                sources: Array.from(state.records.keys())
            });
        },
        survivingExports(reachable) {
            return new Map(input.files.flatMap(function (file) {
                const source = file.sourceFile.getSourceFile();
                if (index.names(source) === undefined) {
                    return [];
                }
                const surviving = new Set(
                    Array.from(index.candidates(source)).filter(function (name) {
                        const identifier = targets.exported(source, name);
                        return identifier !== undefined && reachable.has(identifier);
                    })
                );
                return [ [ file.targetFilePath, surviving ] ] as const;
            }));
        }
    };
}
