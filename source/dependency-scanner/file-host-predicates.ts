export function isDeclarationFile(filePath: string): boolean {
    const lowerCasedFilePath = filePath.toLowerCase();
    return (
        lowerCasedFilePath.endsWith('.d.ts') ||
        lowerCasedFilePath.endsWith('.d.cts') ||
        lowerCasedFilePath.endsWith('.d.mts')
    );
}

export function isTypesRootFolder(directoryPath: string): boolean {
    return directoryPath.endsWith('/node_modules/@types') || directoryPath.includes('/node_modules/@types/');
}
