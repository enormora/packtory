import type { SourceFile, Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import type { SideEffectClassifier } from '../side-effect-classifier.ts';
import { localBindingIdentifiers, type FileBindings } from '../reachability/binding-identifier.ts';
import { observeReachableBindings } from '../reachability/binding-observation.ts';
import { readModuleExportModel, type ModuleExportModel } from './module-export-model.ts';
import { createModuleExportIndex, type ModuleExportIndex } from './module-export-index.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';
import { createNamespaceDemandAnalysis, type NamespaceDemandAnalysis } from './namespace-demand-analysis.ts';
import { createNamespaceReceiverAnalysis } from './namespace-receiver-analysis.ts';

export type ExportGraphInput = {
    readonly files: readonly FileBindings[];
    readonly publicPaths: ReadonlySet<string>;
    readonly classifySideEffects: SideEffectClassifier;
    readonly settings: DeadCodeEliminationSettings | undefined;
    readonly observedBindings: ReadonlySet<string> | undefined;
};
export type ModuleGraphRecord = {
    readonly file: FileBindings;
    readonly model: ModuleExportModel;
    readonly bindingIdentifiers: ReadonlyMap<string, string>;
};
export type ModuleGraphAnalysis = {
    readonly records: ReadonlyMap<SourceFile, ModuleGraphRecord>;
    readonly index: ModuleExportIndex;
    readonly demand: NamespaceDemandAnalysis;
    readonly resolveModule: ExportTargetResolver;
    readonly effects: (source: SourceFile) => ReadonlySet<Statement>;
};

export function createModuleGraphAnalysis(input: ExportGraphInput): ModuleGraphAnalysis {
    const records = new Map(input.files.map(function (file) {
        const source = file.sourceFile.getSourceFile();
        return [ source, {
            file,
            model: readModuleExportModel(source),
            bindingIdentifiers: localBindingIdentifiers(file)
        } ] as const;
    }));
    const byTarget = new Map(input.files.map(function (file) {
        return [ file.targetFilePath, file.sourceFile.getSourceFile() ];
    }));
    const resolveModule: ExportTargetResolver = function (source, specifier) {
        const reference = records.get(source)?.file.moduleReferences.find(function (candidate) {
            return candidate.emittedSpecifier === specifier;
        });
        return reference?.type === 'local-code' ? byTarget.get(reference.targetFilePath) : undefined;
    };
    const index = createModuleExportIndex(
        Array.from(records.values(), function (record) {
            return record.model;
        }),
        resolveModule
    );
    const publicFiles = new Set(
        input
            .files
            .filter(function (file) {
                return input.publicPaths.has(file.targetFilePath);
            })
            .map(function (file) {
                return file.sourceFile.getSourceFile();
            })
    );
    const effects = new Map<SourceFile, ReadonlySet<Statement>>();
    return {
        records,
        index,
        demand: createNamespaceDemandAnalysis(Array.from(records.keys()), publicFiles, resolveModule, {
            receiverIsUnobserved: createNamespaceReceiverAnalysis(index, resolveModule),
            isObserved: observeReachableBindings(input.files, input.observedBindings)
        }),
        resolveModule,
        effects(source) {
            let statements = effects.get(source);
            if (statements === undefined) {
                statements = new Set(
                    input.classifySideEffects(source, input.settings).map(function (effect) {
                        return effect.statement;
                    })
                );
                effects.set(source, statements);
            }
            return statements;
        }
    };
}
