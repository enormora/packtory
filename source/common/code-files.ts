export function isCodeFile(targetFilePath: string): boolean {
    return /\.[cm]?[jt]sx?$/.test(targetFilePath);
}

export function isDeclarationCodeFile(targetFilePath: string): boolean {
    return targetFilePath.endsWith('.d.ts');
}

function basenameOf(targetFilePath: string): string {
    return targetFilePath.slice(targetFilePath.lastIndexOf('/') + 1);
}

export function isTextDiffablePath(targetFilePath: string): boolean {
    return isCodeFile(targetFilePath) || /\.(?:json|md|txt|ya?ml|map)$/.test(targetFilePath) ||
        [ 'LICENSE', 'COPYING', 'NOTICE', 'CHANGELOG', 'readme' ].includes(basenameOf(targetFilePath));
}
