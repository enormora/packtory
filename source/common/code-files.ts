const codeFilePattern = /(?:\.d\.ts|\.[cm]?[jt]sx?)$/;
export function isCodeFile(targetFilePath: string): boolean {
    return codeFilePattern.test(targetFilePath);
}

export function isDeclarationCodeFile(targetFilePath: string): boolean {
    return targetFilePath.endsWith('.d.ts');
}

const textDiffablePatterns: readonly RegExp[] = [
    /(?:\.d\.ts|\.[cm]?[jt]sx?)$/,
    /\.json$/,
    /\.md$/,
    /\.txt$/,
    /\.ya?ml$/,
    /\.map$/
];

const textDiffableBasenames: ReadonlySet<string> = new Set(['LICENSE', 'COPYING', 'NOTICE', 'CHANGELOG', 'readme']);

function basenameOf(targetFilePath: string): string {
    return targetFilePath.slice(targetFilePath.lastIndexOf('/') + 1);
}

export function isTextDiffablePath(targetFilePath: string): boolean {
    const matchesPattern = textDiffablePatterns.some((pattern) => {
        return pattern.test(targetFilePath);
    });
    if (matchesPattern) {
        return true;
    }
    return textDiffableBasenames.has(basenameOf(targetFilePath));
}
