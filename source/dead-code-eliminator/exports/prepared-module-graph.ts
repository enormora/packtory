import type { SourceFile } from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import { createModuleExportIndex, type ModuleExportIndex } from './module-export-index.ts';
import { readModuleExportModel } from './module-export-model.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';

export type PreparedModule = {
    readonly sourceFile: SourceFile;
    readonly targetFilePath: string;
    readonly moduleReferences: readonly ArtifactModuleReference[];
};

export type PreparedModuleGraph = {
    readonly index: ModuleExportIndex;
    readonly resolveModule: ExportTargetResolver;
};

export function createPreparedModuleGraph(files: readonly PreparedModule[]): PreparedModuleGraph {
    const bySource = new Map(files.map(function (file) {
        return [ file.sourceFile, file ];
    }));
    const byTarget = new Map(files.map(function (file) {
        return [ file.targetFilePath, file.sourceFile ];
    }));
    const resolveModule: ExportTargetResolver = function (source, specifier) {
        const reference = bySource.get(source)?.moduleReferences.find(function (candidate) {
            return candidate.emittedSpecifier === specifier;
        });
        return reference?.type === 'local-code' ? byTarget.get(reference.targetFilePath) : undefined;
    };
    return {
        index: createModuleExportIndex(
            files.map(function (file) {
                return readModuleExportModel(file.sourceFile);
            }),
            resolveModule
        ),
        resolveModule
    };
}
