import path from 'node:path';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { PacktoryConfigurationWithoutRegistry } from '../source/configuration/configuration.ts';

export const memoryWorkloadEntryCount = 8;
const moduleCount = 128;
const exportsPerModule = 128;

export async function createReleaseAnalysisMemoryWorkload(
    fileManager: FileManager,
    sourcesFolder: string,
    entryCount: number
): Promise<PacktoryConfigurationWithoutRegistry> {
    for (let moduleIndex = 0; moduleIndex < moduleCount; moduleIndex += 1) {
        const declarations = Array
            .from({ length: exportsPerModule }, function (_value, exportIndex) {
                return `export declare const value${exportIndex}: number;`;
            })
            .join('\n');
        const javaScript = Array
            .from({ length: exportsPerModule }, function (_value, exportIndex) {
                return `export const value${exportIndex} = ${moduleIndex + exportIndex};`;
            })
            .join('\n');
        await fileManager.writeFile(path.join(sourcesFolder, `module-${moduleIndex}.js`), javaScript);
        await fileManager.writeFile(path.join(sourcesFolder, `module-${moduleIndex}.d.ts`), declarations);
    }

    for (let entryIndex = 0; entryIndex < memoryWorkloadEntryCount; entryIndex += 1) {
        const content = `export { value0 } from './module-${entryIndex}.js';\n`;
        await fileManager.writeFile(path.join(sourcesFolder, `entry-${entryIndex}.js`), content);
        await fileManager.writeFile(path.join(sourcesFolder, `entry-${entryIndex}.d.ts`), content);
    }

    return {
        commonPackageSettings: {
            mainPackageManifest: { type: 'module' },
            includeSourceMapFiles: false,
            publishSettings: { access: 'public' }
        },
        packages: Array.from({ length: entryCount }, function (_value, entryIndex) {
            return {
                name: `memory-package-${entryIndex}`,
                sourcesFolder,
                roots: {
                    main: {
                        javaScript: `entry-${entryIndex}.js`,
                        declarationFile: `entry-${entryIndex}.d.ts`
                    }
                }
            };
        })
    };
}
