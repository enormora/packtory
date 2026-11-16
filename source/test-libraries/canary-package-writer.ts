import path from 'node:path';
import type { FileManager } from '../file-manager/file-manager.ts';

type CanaryPackageDestination = {
    readonly fileManager: Pick<FileManager, 'writeFile'>;
    readonly nodeModulesFolder: string;
};
export async function writeCanaryPackage(
    destination: CanaryPackageDestination,
    name: string,
    manifest: Readonly<Record<string, unknown>>,
    files: Readonly<Record<string, string>>
): Promise<void> {
    const { fileManager, nodeModulesFolder } = destination;
    const folder = path.join(nodeModulesFolder, name);
    await fileManager.writeFile(path.join(folder, 'package.json'), JSON.stringify({ name, ...manifest }));
    await Promise.all(
        Object.entries(files).map(async function ([ filePath, content ]) {
            await fileManager.writeFile(path.join(folder, filePath), content);
        })
    );
}
