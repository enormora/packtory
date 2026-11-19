import path from 'node:path';

export function isDeclarationCodeTargetPath(targetFilePath: string): boolean {
    return [ '.d.ts', '.d.cts', '.d.mts' ].some(function (extension) {
        return targetFilePath.endsWith(extension);
    });
}

export function isRuntimeCodeTargetPath(targetFilePath: string): boolean {
    return [ '.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx' ].includes(path.extname(targetFilePath)) &&
        !isDeclarationCodeTargetPath(targetFilePath);
}

export function isCodeTargetPath(targetFilePath: string): boolean {
    return isRuntimeCodeTargetPath(targetFilePath) || isDeclarationCodeTargetPath(targetFilePath);
}
