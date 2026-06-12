import path from 'node:path';
import { TraceMap } from '@jridgewell/trace-mapping';
import { compareValues } from '../common/sort-values.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { FileManager } from '../file-manager/file-manager.ts';

export type ChangelogSourceAttributionDependencies = {
    readonly fileManager: Pick<FileManager, 'checkReadability' | 'readFile'>;
    readonly repositoryFolder: string;
};

type ReferencedMap = {
    readonly content: string;
    readonly mapFilePath: string;
};

const sourceMappingPrefix = '//# sourceMappingURL=';
const javaScriptFilePattern = /\.[cm]?jsx?$/u;

function sortedUnique(values: readonly string[]): readonly string[] {
    return Array.from(new Set(values)).toSorted(compareValues);
}

function isJavaScriptFile(filePath: string): boolean {
    return javaScriptFilePattern.test(filePath);
}

function toRepositoryRelativePath(repositoryFolder: string, filePath: string): string {
    const relativePath = path.relative(repositoryFolder, filePath);
    if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Changelog source file "${filePath}" is outside repository folder "${repositoryFolder}"`);
    }
    return relativePath.split(path.sep).join('/');
}

function sourceMappingUrlsFrom(fileContent: string): readonly string[] {
    return fileContent.split('\n').flatMap((line) => {
        if (!line.startsWith(sourceMappingPrefix)) {
            return [];
        }
        const sourceMappingUrl = line.slice(sourceMappingPrefix.length);
        return sourceMappingUrl === '' ? [] : [sourceMappingUrl];
    });
}

function parseTraceMap(mapFilePath: string, content: string): TraceMap {
    try {
        return new TraceMap(content);
    } catch (error: unknown) {
        throw new Error(`Failed to parse source map "${mapFilePath}"`, { cause: error });
    }
}

function resolveMapSource(mapFilePath: string, traceMap: TraceMap, source: string | null): string {
    if (source === null) {
        throw new Error(`Source map "${mapFilePath}" contains an empty source`);
    }
    return path.resolve(path.dirname(mapFilePath), traceMap.sourceRoot ?? '', source);
}

function singleSourceMappingUrlFrom(sourceFilePath: string, sourceMappingUrls: readonly string[]): string | undefined {
    if (sourceMappingUrls.length > 1) {
        throw new Error(`Multiple sourceMappingURL references found in "${sourceFilePath}"`);
    }

    return sourceMappingUrls[0];
}

async function ensureMapIsReadable(
    dependencies: ChangelogSourceAttributionDependencies,
    sourceFilePath: string,
    mapFilePath: string
): Promise<void> {
    const readability = await dependencies.fileManager.checkReadability(mapFilePath);
    if (!readability.isReadable) {
        throw new Error(`Source map "${mapFilePath}" referenced by "${sourceFilePath}" is not readable`);
    }
}

async function readReferencedMap(
    dependencies: ChangelogSourceAttributionDependencies,
    sourceFilePath: string
): Promise<ReferencedMap | undefined> {
    const fileContent = await dependencies.fileManager.readFile(sourceFilePath);
    const sourceMappingUrl = singleSourceMappingUrlFrom(sourceFilePath, sourceMappingUrlsFrom(fileContent));

    if (sourceMappingUrl === undefined) {
        return undefined;
    }

    const mapFilePath = path.resolve(path.dirname(sourceFilePath), sourceMappingUrl);
    await ensureMapIsReadable(dependencies, sourceFilePath, mapFilePath);
    return {
        mapFilePath,
        content: await dependencies.fileManager.readFile(mapFilePath)
    };
}

async function attributeJavaScriptFile(
    dependencies: ChangelogSourceAttributionDependencies,
    sourceFilePath: string
): Promise<readonly string[]> {
    const referencedMap = await readReferencedMap(dependencies, sourceFilePath);
    if (referencedMap === undefined) {
        return [toRepositoryRelativePath(dependencies.repositoryFolder, sourceFilePath)];
    }

    const traceMap = parseTraceMap(referencedMap.mapFilePath, referencedMap.content);
    return traceMap.sources.map((source) => {
        return toRepositoryRelativePath(
            dependencies.repositoryFolder,
            resolveMapSource(referencedMap.mapFilePath, traceMap, source)
        );
    });
}

async function attributedFilesFor(
    dependencies: ChangelogSourceAttributionDependencies,
    entry: AnalyzedBundleResource
): Promise<readonly string[]> {
    const {
        fileDescription: { sourceFilePath }
    } = entry;
    if (isJavaScriptFile(sourceFilePath)) {
        return attributeJavaScriptFile(dependencies, sourceFilePath);
    }
    return [toRepositoryRelativePath(dependencies.repositoryFolder, sourceFilePath)];
}

export async function attributeChangelogSourceFiles(
    dependencies: ChangelogSourceAttributionDependencies,
    analyzedBundle: AnalyzedBundle
): Promise<readonly string[]> {
    const attributedFiles: string[] = [];
    for (const entry of analyzedBundle.contents) {
        if (!entry.isGeneratedManifest) {
            attributedFiles.push(...(await attributedFilesFor(dependencies, entry)));
        }
    }
    return sortedUnique(attributedFiles);
}
