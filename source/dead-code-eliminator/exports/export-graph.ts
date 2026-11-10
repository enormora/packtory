import type { Node as TypeScriptMorphNode, CallExpression, ExportDeclaration, SourceFile } from 'ts-morph';
import { bindingIdentifier } from '../reachability/binding-identifier.ts';
import { createModuleGraphAnalysis, type ExportGraphInput } from './module-graph-analysis.ts';
import { resolveImportedExport } from './module-export-resolver.ts';
import { dynamicImportDependencies } from './module-export-dependencies.ts';
import { createExportGraphModules, type GraphModule } from './export-graph-modules.ts';
import { collectBindingDependencies } from './binding-dependencies.ts';

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

export function createExportGraph(input: ExportGraphInput): ExportGraph {
    const analysis = createModuleGraphAnalysis(input);
    const graph = createExportGraphModules(analysis);
    const { index, resolveModule } = analysis;
    const external = new Map<string, readonly string[]>();

    function registerModule(module: GraphModule): void {
        const { file, model } = module.record;
        const { source } = model;
        module.evaluated();
        index.candidates(source).forEach(function (name) {
            external.set(bindingIdentifier(file.targetFilePath, name), [ module.evaluated(), module.exported(name) ]);
        });
        file.bindings.forEach(function (descriptor) {
            const request = resolveImportedExport(descriptor.declarationNode, resolveModule);
            if (request?.name !== undefined) {
                graph.targets.exported(request.source, request.name);
            }
        });
    }

    graph.modules.forEach(registerModule);
    graph.materialize();
    return {
        nodes: graph.nodes,
        importedTargets: graph.importedTargets,
        namespaceBindingTargets: graph.namespaceBindingTargets,
        declarationTargets: graph.declarationTargets,
        bindingDependencies(identifier) {
            return collectBindingDependencies(identifier, graph.nodes);
        },
        externalTargets(seeds) {
            return Array.from(seeds).flatMap(function (seed) {
                return external.get(seed) ?? [];
            });
        },
        owns(source) {
            return graph.modules.has(source) && !source.isDeclarationFile();
        },
        roots() {
            return Array
                .from(graph.modules.values())
                .filter(function (module) {
                    return input.publicPaths.has(module.record.file.targetFilePath);
                })
                .flatMap(function (module) {
                    const { source } = module.record.model;
                    const names = index.names(source) ?? index.candidates(source);
                    return [ module.evaluated(), ...Array.from(names, module.exported) ];
                });
        },
        dynamicTargets(call) {
            return dynamicImportDependencies(call, {
                ...graph.targets,
                resolveModule,
                sources: Array.from(graph.modules.values(), function (module) {
                    return module.record.model.source;
                })
            });
        },
        survivingExports(reachable) {
            return new Map(
                Array.from(graph.modules.values()).flatMap(function (module) {
                    const { source } = module.record.model;
                    if (index.names(source) === undefined) {
                        return [];
                    }
                    const surviving = new Set(
                        Array.from(index.candidates(source)).filter(function (name) {
                            return reachable.has(module.exported(name));
                        })
                    );
                    return [ [ module.record.file.targetFilePath, surviving ] ] as const;
                })
            );
        }
    };
}
