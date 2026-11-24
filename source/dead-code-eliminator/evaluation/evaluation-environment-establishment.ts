import type { Expression, SourceFile } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { registerEvaluationEnvironment } from './evaluation-environment.ts';
import { scanIntrinsicIntegrity } from './intrinsic-integrity.ts';
import { evaluateImportedConstant } from './imported-constant.ts';

export function establishEvaluationEnvironment(
    sources: readonly SourceFile[],
    settings: DeadCodeEliminationSettings | undefined,
    resolveModule: RuntimeModuleResolver
): void {
    const environment = {
        intrinsics: scanIntrinsicIntegrity(sources),
        settings,
        resolveRuntimeModule: resolveModule,
        readImportedConstant(expression: Expression) {
            return evaluateImportedConstant(expression, resolveModule);
        }
    };
    for (const source of sources) {
        registerEvaluationEnvironment(source.getProject(), environment);
    }
}
