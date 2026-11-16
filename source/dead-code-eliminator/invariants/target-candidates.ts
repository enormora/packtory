import { match } from 'ts-pattern';
import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';
import { isDeclarationCodeTargetPath } from '../liveness/runtime-code.ts';
import type { DeadCodeEliminationExportCheckMode } from './export-resolution.ts';

function runtimeCandidates(targetPath: string): readonly string[] {
    return [
        targetPath,
        `${targetPath}.js`,
        `${targetPath}.jsx`,
        `${targetPath}.mjs`,
        `${targetPath}.cjs`,
        `${targetPath}.ts`,
        `${targetPath}.tsx`,
        `${targetPath}.mts`,
        `${targetPath}.cts`,
        `${targetPath}.json`,
        `${targetPath}.wasm`
    ];
}

function sourceDeclarationCandidates(targetPath: string): readonly string[] {
    if (isDeclarationCodeTargetPath(targetPath)) {
        return [];
    }
    const extension = targetPath.slice(targetPath.lastIndexOf('.'));
    const targetPathWithoutExtension = targetPath.slice(0, -extension.length);
    return match(extension)
        .with('.mts', function () {
            return [ `${targetPathWithoutExtension}.d.mts`, `${targetPathWithoutExtension}.d.ts` ];
        })
        .with('.cts', function () {
            return [ `${targetPathWithoutExtension}.d.cts`, `${targetPathWithoutExtension}.d.ts` ];
        })
        .with('.tsx', '.ts', function () {
            return [ `${targetPathWithoutExtension}.d.ts` ];
        })
        .otherwise(function () {
            return [];
        });
}

export function declarationCandidates(targetPath: string): readonly string[] {
    return [
        targetPath,
        ...declarationCompanionCandidates(targetPath),
        ...sourceDeclarationCandidates(targetPath),
        `${targetPath}.d.ts`,
        `${targetPath}.d.mts`,
        `${targetPath}.d.cts`
    ];
}

export function candidatesFor(
    mode: DeadCodeEliminationExportCheckMode,
    targetPath: string
): readonly string[] {
    return mode === 'runtime' ? runtimeCandidates(targetPath) : declarationCandidates(targetPath);
}
