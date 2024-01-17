import path from 'node:path';
import fs from 'node:fs';
import type { MainPackageJson } from '../source/config/package-json.js';

export async function loadPackageJson(baseDir: string): Promise<MainPackageJson> {
    const fileContent = await fs.promises.readFile(path.join(baseDir, 'package.json'), 'utf8');
    return JSON.parse(fileContent) as MainPackageJson;
}
