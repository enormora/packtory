import path from 'node:path';
import { TraceMap } from '@jridgewell/trace-mapping';
import { bundleRelativePath } from '../common/package-layout.ts';
import { compareValues } from '../common/sort-values.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { FileManager } from '../file-manager/file-manager.ts';

export type ChangelogSourceAttributionDependencies = {
    readonly fileManager: Pick<FileManager, 'checkReadability' | 'readFile'>;
    readonly repositoryFolder: string;
};

export type ManifestChangelogInputs = {
    readonly dependencies?: Readonly<Record<string, unknown>> | undefined;
    readonly imports?: Readonly<Record<string, unknown>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, unknown>> | undefined;
};

const packageManifestInputFilePaths = new Set([
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'pnpm-lock.yaml',
    'yarn.lock'
]);

const dependencyFieldNames = [ 'dependencies', 'optionalDependencies', 'peerDependencies' ] as const;

type ReferencedMap = {
    readonly content: string;
    readonly mapFilePath: string;
};

const sourceMappingPrefix = '//# sourceMappingURL=';

function sortUniqueValues(values: readonly string[]): readonly string[] {
    return Array.from(new Set(values)).toSorted(compareValues);
}

function hasEntries(value: Readonly<Record<string, unknown>> | undefined): boolean {
    return value !== undefined && Object.keys(value).length > 0;
}

function hasGeneratedManifestInputs(mainPackageJson: ManifestChangelogInputs): boolean {
    return (
        hasEntries(mainPackageJson.dependencies) ||
        hasEntries(mainPackageJson.peerDependencies) ||
        hasEntries(mainPackageJson.imports)
    );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonRecord(content: string): Readonly<Record<string, unknown>> | undefined {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : undefined;
}

function dependencyFieldFrom(
    manifest: Readonly<Record<string, unknown>>,
    fieldName: (typeof dependencyFieldNames)[number]
): Readonly<Record<string, unknown>> {
    const field = manifest[fieldName];
    return isRecord(field) ? field : {};
}

function changedDependencyNamesFor(
    previousManifest: Readonly<Record<string, unknown>>,
    currentManifest: Readonly<Record<string, unknown>>,
    fieldName: (typeof dependencyFieldNames)[number]
): readonly string[] {
    const previousDependencies = dependencyFieldFrom(previousManifest, fieldName);
    const currentDependencies = dependencyFieldFrom(currentManifest, fieldName);
    const names = new Set([ ...Object.keys(previousDependencies), ...Object.keys(currentDependencies) ]);
    return Array
        .from(names)
        .filter(function (name) {
            return previousDependencies[name] !== currentDependencies[name];
        })
        .toSorted(compareValues);
}

export function collectManifestChangelogSourceFiles(
    mainPackageJson: ManifestChangelogInputs,
    additionalSourceFiles: readonly string[]
): readonly string[] {
    return [ ...hasGeneratedManifestInputs(mainPackageJson) ? [ 'package.json' ] : [], ...additionalSourceFiles ];
}

export function isPackageManifestInputPath(filePath: string): boolean {
    return packageManifestInputFilePaths.has(filePath);
}

export function changedPackageManifestDependencyNames(
    previousManifestContent: string,
    currentManifestContent: string
): readonly string[] {
    const previousManifest = parseJsonRecord(previousManifestContent);
    const currentManifest = parseJsonRecord(currentManifestContent);
    if (previousManifest === undefined || currentManifest === undefined) {
        return [];
    }

    return Array
        .from(
            new Set(
                dependencyFieldNames.flatMap(function (fieldName) {
                    return changedDependencyNamesFor(previousManifest, currentManifest, fieldName);
                })
            )
        )
        .toSorted(compareValues);
}

function isJavaScriptFile(filePath: string): boolean {
    return /\.[cm]?jsx?$/u.test(filePath);
}

function toRepositoryRelativePath(repositoryFolder: string, filePath: string): string {
    const relativePath = path.relative(repositoryFolder, filePath);
    if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Changelog source file "${filePath}" is outside repository folder "${repositoryFolder}"`);
    }
    return relativePath.split(path.sep).join('/');
}

function collectSourceMappingUrls(fileContent: string): readonly string[] {
    return fileContent.split('\n').flatMap(function (line) {
        if (!line.startsWith(sourceMappingPrefix)) {
            return [];
        }
        const sourceMappingUrl = line.slice(sourceMappingPrefix.length);
        return sourceMappingUrl === '' ? [] : [ sourceMappingUrl ];
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

function resolveSingleSourceMappingUrl(
    sourceFilePath: string,
    sourceMappingUrls: readonly string[]
): string | undefined {
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
    const sourceMappingUrl = resolveSingleSourceMappingUrl(sourceFilePath, collectSourceMappingUrls(fileContent));

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
        return [ toRepositoryRelativePath(dependencies.repositoryFolder, sourceFilePath) ];
    }

    const traceMap = parseTraceMap(referencedMap.mapFilePath, referencedMap.content);
    return traceMap.sources.map(function (source) {
        return toRepositoryRelativePath(
            dependencies.repositoryFolder,
            resolveMapSource(referencedMap.mapFilePath, traceMap, source)
        );
    });
}

async function collectAttributedFiles(
    dependencies: ChangelogSourceAttributionDependencies,
    entry: AnalyzedBundleResource
): Promise<readonly string[]> {
    const {
        fileDescription: { sourceFilePath }
    } = entry;
    if (isJavaScriptFile(sourceFilePath)) {
        return attributeJavaScriptFile(dependencies, sourceFilePath);
    }
    return [ toRepositoryRelativePath(dependencies.repositoryFolder, sourceFilePath) ];
}

export async function attributeChangelogSourceFiles(
    dependencies: ChangelogSourceAttributionDependencies,
    analyzedBundle: AnalyzedBundle,
    additionalSourceFiles: readonly string[]
): Promise<readonly string[]> {
    const attributedFiles: string[] = Array.from(additionalSourceFiles);
    for (const entry of analyzedBundle.contents) {
        if (!entry.isGeneratedManifest) {
            attributedFiles.push(...await collectAttributedFiles(dependencies, entry));
        }
    }
    return sortUniqueValues(attributedFiles);
}

export async function attributeSelectedChangelogSourceFiles(
    dependencies: ChangelogSourceAttributionDependencies,
    analyzedBundle: AnalyzedBundle,
    additionalSourceFiles: readonly string[],
    selectedArtifactFiles: ReadonlySet<string>
): Promise<readonly string[]> {
    const attributedFiles: string[] = Array.from(additionalSourceFiles);
    for (const entry of analyzedBundle.contents) {
        const targetFilePath = bundleRelativePath(entry.fileDescription.targetFilePath);
        if (!entry.isGeneratedManifest && selectedArtifactFiles.has(targetFilePath)) {
            attributedFiles.push(...await collectAttributedFiles(dependencies, entry));
        }
    }
    return sortUniqueValues(attributedFiles);
}
