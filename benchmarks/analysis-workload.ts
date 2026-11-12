import path from 'node:path';
import { match } from 'ts-pattern';
import { createWorklist } from '../source/common/worklist.ts';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { Root } from '../source/configuration/root.ts';

export type AnalysisWorkloadDefinition = {
    readonly sourceFileCount: number;
    readonly exportsPerFile: number;
    readonly entryPointCount: number;
    readonly declarations: boolean;
    readonly graph: 'chain' | 'cycle' | 'diamond' | 'independent' | 'wide';
};

export type AnalysisWorkload = {
    readonly sourceFiles: ReadonlyMap<string, string>;
    readonly reachableFiles: ReadonlySet<string>;
    readonly runtimeEntries: readonly string[];
    readonly declarationEntries: readonly string[];
    readonly roots: Readonly<Record<string, Root>>;
};

const diamondSize = 4;
const diamondLeft = 1;
const diamondRight = 2;
const diamondLeaf = 3;

function dependenciesOf(index: number, definition: AnalysisWorkloadDefinition): readonly number[] {
    return match(definition.graph)
        .with('chain', function () {
            return index + 1 < definition.sourceFileCount ? [ index + 1 ] : [];
        })
        .with('cycle', function () {
            return [ (index + 1) % definition.sourceFileCount ];
        })
        .with('wide', function () {
            return index === 0
                ? Array.from({ length: definition.sourceFileCount - 1 }, function (_value, position) {
                    return position + 1;
                })
                : [];
        })
        .with('diamond', function () {
            if (index % diamondSize === 0) {
                return [ index + diamondLeft, index + diamondRight ];
            }
            return index % diamondSize === diamondLeaf ? [] : [ index - index % diamondSize + diamondLeaf ];
        })
        .with('independent', function () {
            return [];
        })
        .exhaustive();
}

function sourceExtensions(definition: AnalysisWorkloadDefinition): readonly string[] {
    return definition.declarations ? [ '.js', '.d.ts' ] : [ '.js' ];
}

function moduleContents(index: number, definition: AnalysisWorkloadDefinition, declarations: boolean): string {
    const imports = dependenciesOf(index, definition).map(function (dependency) {
        return `export { value0 as dependency${dependency} } from './module-${dependency}.js';`;
    });
    const exports = Array.from({ length: definition.exportsPerFile }, function (_value, exportIndex) {
        return declarations
            ? `export declare const value${exportIndex}: number;`
            : `export const value${exportIndex} = ${index + exportIndex};`;
    });
    return [ ...imports, ...exports ].join('\n').concat('\n');
}

function reachableModules(definition: AnalysisWorkloadDefinition): ReadonlySet<number> {
    const initial = Array.from({ length: definition.entryPointCount }, function (_value, index) {
        return index;
    });
    const reached = new Set(initial);
    const pending = createWorklist(initial);
    for (let index = pending.takeNext(); index !== undefined; index = pending.takeNext()) {
        const unvisited = dependenciesOf(index, definition).filter(function isUnvisited(dependency) {
            return !reached.has(dependency);
        });
        for (const dependency of unvisited) {
            reached.add(dependency);
        }
        pending.scheduleAll(unvisited);
    }
    return reached;
}

function moduleFiles(folder: string, definition: AnalysisWorkloadDefinition): readonly (readonly [string, string])[] {
    return Array
        .from({ length: definition.sourceFileCount }, function (_value, index) {
            return sourceExtensions(definition).map(function (extension) {
                return [
                    path.join(folder, `module-${index}${extension}`),
                    moduleContents(index, definition, extension === '.d.ts')
                ] as const;
            });
        })
        .flat();
}

function entryPaths(folder: string, definition: AnalysisWorkloadDefinition, extension: string): readonly string[] {
    return Array.from({ length: definition.entryPointCount }, function (_value, index) {
        return path.join(folder, `entry-${index}${extension}`);
    });
}

export async function createAnalysisWorkload(
    fileManager: FileManager,
    sourcesFolder: string,
    definition: AnalysisWorkloadDefinition
): Promise<AnalysisWorkload> {
    const runtimeEntries = entryPaths(sourcesFolder, definition, '.js');
    const declarationEntries = definition.declarations ? entryPaths(sourcesFolder, definition, '.d.ts') : [];
    const sourceFiles = new Map([
        ...moduleFiles(sourcesFolder, definition),
        ...[ runtimeEntries, declarationEntries ].flatMap(function (entries) {
            return entries.map(function (filePath, index) {
                return [ filePath, `export { value0 } from './module-${index}.js';\n` ] as const;
            });
        })
    ]);
    const reachableFiles = new Set([
        ...runtimeEntries,
        ...declarationEntries,
        ...Array.from(reachableModules(definition)).flatMap(function (index) {
            return sourceExtensions(definition).map(function (extension) {
                return path.join(sourcesFolder, `module-${index}${extension}`);
            });
        })
    ]);
    const roots = Object.fromEntries(runtimeEntries.map(function (entry, index) {
        const root: Root = definition.declarations
            ? { javaScript: path.basename(entry), declarationFile: `entry-${index}.d.ts` }
            : { javaScript: path.basename(entry) };
        return [ `entry${index}`, root ];
    }));
    for (const [ filePath, content ] of sourceFiles) {
        await fileManager.writeFile(filePath, content);
    }
    return { sourceFiles, reachableFiles, runtimeEntries, declarationEntries, roots };
}
