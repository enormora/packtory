import path from 'node:path';

const runtimeCodeExtensions = new Set([ '.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx' ]);
const declarationCodeExtensions = [ '.d.ts', '.d.cts', '.d.mts' ];

export function isDeclarationCodeTargetPath(targetFilePath: string): boolean {
    return declarationCodeExtensions.some(function (extension) {
        return targetFilePath.endsWith(extension);
    });
}

export function isRuntimeCodeTargetPath(targetFilePath: string): boolean {
    return runtimeCodeExtensions.has(path.extname(targetFilePath)) &&
        !isDeclarationCodeTargetPath(targetFilePath);
}

export function isCodeTargetPath(targetFilePath: string): boolean {
    return isRuntimeCodeTargetPath(targetFilePath) || isDeclarationCodeTargetPath(targetFilePath);
}
