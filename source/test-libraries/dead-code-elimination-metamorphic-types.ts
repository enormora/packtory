import type {
    GeneratedDeadCodeEliminationProgramSet,
    GeneratedExpression
} from './dead-code-elimination-generated-programs.ts';

export const deadCodeEliminationMetamorphicTransformKinds = [
    'declaration-companion-chain',
    'direct-export-conversion',
    'eliminate-twice',
    'import-aliasing',
    'intermediate-reexport',
    'local-binding-rename',
    'pure-side-effect-import',
    'top-level-unused-reorder',
    'unused-modules',
    'unused-runtime-surface'
] as const;

export type DeadCodeEliminationMetamorphicTransformKind = typeof deadCodeEliminationMetamorphicTransformKinds[number];

export type GeneratedDeadCodeEliminationMetamorphicCase = {
    readonly name: string;
    readonly transformKind: DeadCodeEliminationMetamorphicTransformKind;
    readonly original: GeneratedDeadCodeEliminationProgramSet;
    readonly transformed: GeneratedDeadCodeEliminationProgramSet;
};

export type DeadCodeEliminationMetamorphicInput = {
    readonly kind: DeadCodeEliminationMetamorphicTransformKind;
    readonly expression: GeneratedExpression;
    readonly secondExpression: GeneratedExpression;
    readonly eventName: string;
};
