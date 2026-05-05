import fs from 'node:fs/promises';

export async function readJsonFile(filePath: string): Promise<unknown> {
    const fileContents = await fs.readFile(filePath, 'utf8');
    return JSON.parse(fileContents);
}
