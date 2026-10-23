import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import type { RuntimeModuleResolver } from './runtime-module-resolution.ts';

export type PurityContext = {
    readonly settings: DeadCodeEliminationSettings | undefined;
    readonly resolveRuntimeModule: RuntimeModuleResolver;
};
