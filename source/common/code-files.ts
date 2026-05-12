const codeFilePattern = /(?:\.d\.ts|\.[cm]?[jt]sx?)$/;

export function isCodeFile(targetFilePath: string): boolean {
    return codeFilePattern.test(targetFilePath);
}
