import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';
import { isDeclarationCodeTargetPath } from '../liveness/runtime-code.ts';
import type { DeadCodeEliminationExportCheckMode } from './export-resolution.ts';

type SourceDeclarationTargetRule = {
    readonly declarationExtensions: readonly string[];
    readonly sourceExtension: string;
};

const runtimeTargetExtensions = [
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.json',
    '.wasm'
];
const declarationTargetExtensions = [ '.d.ts', '.d.mts', '.d.cts' ];
const sourceDeclarationTargetRules: readonly SourceDeclarationTargetRule[] = [
    { declarationExtensions: [ '.d.mts', '.d.ts' ], sourceExtension: '.mts' },
    { declarationExtensions: [ '.d.cts', '.d.ts' ], sourceExtension: '.cts' },
    { declarationExtensions: [ '.d.ts' ], sourceExtension: '.tsx' },
    { declarationExtensions: [ '.d.ts' ], sourceExtension: '.ts' }
];

function appendedCandidates(targetPath: string, extensions: readonly string[]): readonly string[] {
    return extensions.map(function (extension) {
        return `${targetPath}${extension}`;
    });
}

function runtimeCandidates(targetPath: string): readonly string[] {
    return [ targetPath, ...appendedCandidates(targetPath, runtimeTargetExtensions) ];
}

function sourceDeclarationCandidates(targetPath: string): readonly string[] {
    if (isDeclarationCodeTargetPath(targetPath)) {
        return [];
    }
    const rule = sourceDeclarationTargetRules.find(function (candidate) {
        return targetPath.endsWith(candidate.sourceExtension);
    });
    if (rule === undefined) {
        return [];
    }
    const targetPathWithoutExtension = targetPath.slice(0, -rule.sourceExtension.length);
    return rule.declarationExtensions.map(function (declarationExtension) {
        return `${targetPathWithoutExtension}${declarationExtension}`;
    });
}

export function declarationCandidates(targetPath: string): readonly string[] {
    return [
        targetPath,
        ...declarationCompanionCandidates(targetPath),
        ...sourceDeclarationCandidates(targetPath),
        ...appendedCandidates(targetPath, declarationTargetExtensions)
    ];
}

export function candidatesFor(
    mode: DeadCodeEliminationExportCheckMode,
    targetPath: string
): readonly string[] {
    return mode === 'runtime' ? runtimeCandidates(targetPath) : declarationCandidates(targetPath);
}
