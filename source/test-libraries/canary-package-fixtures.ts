import assert from 'node:assert';
import fileSystem from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { createFileManager } from '../file-manager/file-manager.ts';

export const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });

async function writePackageFile(packageFolder: string, filePath: string, content: string): Promise<void> {
    const targetPath = path.join(packageFolder, filePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
}

export async function withTemporaryNodeModules<T>(action: (nodeModulesFolder: string) => Promise<T>): Promise<T> {
    const root = await mkdtemp(path.join(temporaryDirectory(), 'packtory-canary-package-api-'));
    try {
        const nodeModulesFolder = path.join(root, 'node_modules');
        await mkdir(nodeModulesFolder, { recursive: true });
        await writePackageFile(root, 'runtime-types/node/index.d.ts', '');
        return await action(nodeModulesFolder);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

async function writePackageAt(
    packageFolder: string,
    packageName: string,
    manifest: Readonly<Record<string, unknown>>,
    files: Readonly<Record<string, string>>
): Promise<void> {
    await mkdir(packageFolder, { recursive: true });
    await writePackageFile(packageFolder, 'package.json', JSON.stringify({ name: packageName, ...manifest }));
    await Promise.all(
        Object.entries(files).map(async function ([ filePath, content ]) {
            await writePackageFile(packageFolder, filePath, content);
        })
    );
}

export async function writePackage(
    nodeModulesFolder: string,
    packageName: string,
    manifest: Readonly<Record<string, unknown>>,
    files: Readonly<Record<string, string>>
): Promise<void> {
    await writePackageAt(path.join(nodeModulesFolder, packageName), packageName, manifest, files);
}

export async function writeScopedPackage(
    nodeModulesFolder: string,
    packageName: string,
    manifest: Readonly<Record<string, unknown>>,
    files: Readonly<Record<string, string>>
): Promise<void> {
    const [ scopeName, localName ] = packageName.split('/', 2);
    if (scopeName === undefined || localName === undefined) {
        throw new Error(`Package "${packageName}" is not scoped`);
    }
    await writePackageAt(path.join(nodeModulesFolder, scopeName, localName), packageName, manifest, files);
}

export function assertPresent<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new assert.AssertionError({
            message: 'Expected value to be present'
        });
    }
    return value;
}
