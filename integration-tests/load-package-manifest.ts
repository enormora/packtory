import path from 'node:path';
import fileSystem from 'node:fs';
import type { MainPackageManifest } from '../source/configuration/package-manifest.ts';

export async function loadPackageManifest(baseDirectory: string): Promise<MainPackageManifest> {
    const fileContent = await fileSystem.promises.readFile(path.join(baseDirectory, 'package.json'), 'utf8');
    return JSON.parse(fileContent) as MainPackageManifest;
}
