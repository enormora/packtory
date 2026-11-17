import path from 'node:path';
import { match, P } from 'ts-pattern';

const declarationCodeExtensions = [ '.d.ts', '.d.cts', '.d.mts' ];

export function isDeclarationCodeTargetPath(targetFilePath: string): boolean {
    return declarationCodeExtensions.some(function (extension) {
        return targetFilePath.endsWith(extension);
    });
}

export function isRuntimeCodeTargetPath(targetFilePath: string): boolean {
    return match(path.extname(targetFilePath))
        .with(P.union('.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'), function () {
            return !isDeclarationCodeTargetPath(targetFilePath);
        })
        .otherwise(function () {
            return false;
        });
}

export function isCodeTargetPath(targetFilePath: string): boolean {
    return isRuntimeCodeTargetPath(targetFilePath) || isDeclarationCodeTargetPath(targetFilePath);
}
