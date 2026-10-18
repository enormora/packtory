import fileSystem from 'node:fs/promises';

export async function readJavaScriptObjectNotationFile(filePath: string): Promise<unknown> {
    const fileContents = await fileSystem.readFile(filePath, 'utf8');
    return JSON.parse(fileContents);
}
