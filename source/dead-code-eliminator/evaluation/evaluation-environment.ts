import type { Project, SourceFile } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../configuration/dead-code-elimination-settings.ts';
import { resolveRuntimeModule, type RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import type { GlobalPath } from './global-path.ts';

export type IntrinsicIntegrity = {
    readonly isIntact: (path: GlobalPath) => boolean;
};

export type EvaluationEnvironment = {
    readonly intrinsics: IntrinsicIntegrity;
    readonly settings: DeadCodeEliminationSettings | undefined;
    readonly resolveRuntimeModule: RuntimeModuleResolver;
};

const unregisteredEnvironment: EvaluationEnvironment = {
    intrinsics: {
        isIntact() {
            return false;
        }
    },
    settings: undefined,
    resolveRuntimeModule
};

const environmentByProject = new WeakMap<Project, EvaluationEnvironment>();

export function registerEvaluationEnvironment(project: Project, environment: EvaluationEnvironment): void {
    environmentByProject.set(project, environment);
}

function evaluationEnvironmentOf(source: SourceFile): EvaluationEnvironment {
    return environmentByProject.get(source.getProject()) ?? unregisteredEnvironment;
}

export function intrinsicIntegrityOf(source: SourceFile): IntrinsicIntegrity {
    return evaluationEnvironmentOf(source).intrinsics;
}
