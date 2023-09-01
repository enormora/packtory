import path from 'node:path';
import fs from 'node:fs';
import {PackageJson} from 'type-fest';

export async function loadPackageJson(baseDir: string): Promise<PackageJson> {
    const fileContent = await fs.promises.readFile(path.join(baseDir, 'package.json'), 'utf8');
    return JSON.parse(fileContent) as PackageJson;
}
