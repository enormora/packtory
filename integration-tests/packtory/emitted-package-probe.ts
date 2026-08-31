import path from 'node:path';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createFileManager } from '../../source/file-manager/file-manager.ts';
import type { ResolvedPackage } from '../../source/packtory/resolved-package.ts';

async function writeAnalyzedPackage(resolvedPackage: ResolvedPackage): Promise<string> {
    const fileManager = createFileManager({ hostFileSystem: fs.promises });
    const packageFolder = await mkdtemp(path.join(tmpdir(), 'packtory-dead-code-elimination-import-repair-'));
    await fileManager.writeFile(path.join(packageFolder, 'package.json'), '{"type":"module"}\n');
    for (const resource of resolvedPackage.analyzedBundle.contents) {
        await fileManager.writeFile(
            path.join(packageFolder, resource.fileDescription.targetFilePath),
            resource.fileDescription.content
        );
    }
    return packageFolder;
}

async function runNodeProbe(script: string): Promise<unknown> {
    return new Promise<unknown>(function (resolve, reject) {
        execFile(
            process.execPath,
            [ '--experimental-strip-types', '--enable-source-maps', '--input-type=module', '-e', script ],
            {
                cwd: process.cwd(),
                encoding: 'utf8',
                timeout: 3000
            },
            function (error, standardOutput) {
                if (error instanceof Error) {
                    reject(error);
                    return;
                }
                try {
                    resolve(JSON.parse(standardOutput));
                } catch (parseError: unknown) {
                    reject(parseError instanceof Error ? parseError : new Error(String(parseError)));
                }
            }
        );
    });
}

function importScript(entryUrl: string): string {
    return `const module = await import(${JSON.stringify(entryUrl)}); console.log(JSON.stringify(module.api()));`;
}

export async function runEmittedPackageApi(resolvedPackage: ResolvedPackage, targetFilePath: string): Promise<unknown> {
    const packageFolder = await writeAnalyzedPackage(resolvedPackage);
    try {
        return await runNodeProbe(importScript(pathToFileURL(path.join(packageFolder, targetFilePath)).href));
    } finally {
        await rm(packageFolder, { recursive: true, force: true });
    }
}
