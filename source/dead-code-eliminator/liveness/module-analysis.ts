import type { SourceFile } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import type { SideEffectStatement } from '../analyzed-bundle.ts';
import type { BindingDescriptor } from '../reachability/binding-extractor.ts';
import { classifySideEffects } from '../side-effect-classifier.ts';
import { isDeclarationCodeTargetPath, isRuntimeCodeTargetPath } from './runtime-code.ts';

type ModuleKind = 'asset' | 'declaration' | 'other' | 'runtime' | 'source-map';

type DeclarationRecord = {
    readonly name: string;
    readonly exported: boolean;
};

export type ModuleAnalysis = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly kind: ModuleKind;
    readonly declarations: readonly DeclarationRecord[];
    readonly effects: readonly SideEffectStatement[];
};

type ModuleAnalysisInput = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly sourceFile: Readonly<SourceFile> | undefined;
    readonly bindings: readonly BindingDescriptor[];
    readonly deadCodeElimination: DeadCodeEliminationSettings | undefined;
};

function moduleKindForTargetPath(targetFilePath: string): ModuleKind {
    if (isDeclarationCodeTargetPath(targetFilePath)) {
        return 'declaration';
    }
    if (isRuntimeCodeTargetPath(targetFilePath)) {
        return 'runtime';
    }
    if (targetFilePath.endsWith('.map')) {
        return 'source-map';
    }
    return targetFilePath.includes('.') ? 'asset' : 'other';
}

export function buildModuleAnalysis(input: ModuleAnalysisInput): ModuleAnalysis {
    return {
        sourceFilePath: input.sourceFilePath,
        targetFilePath: input.targetFilePath,
        kind: moduleKindForTargetPath(input.targetFilePath),
        declarations: input.bindings.map(function (binding) {
            return { name: binding.name, exported: binding.isExported };
        }),
        effects: input.sourceFile === undefined
            ? []
            : classifySideEffects(input.sourceFile, input.deadCodeElimination)
    };
}
