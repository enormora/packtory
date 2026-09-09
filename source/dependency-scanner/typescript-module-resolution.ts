import path from 'node:path';
import { ts, type SourceFile } from 'ts-morph';

type TypescriptModuleFilePathResolution = {
    readonly moduleSpecifier: string;
    readonly containingSourceFile: Readonly<SourceFile>;
    readonly resolutionMode: TypescriptModuleResolutionMode;
};
type PackageTypeLookup = {
    readonly filePath: string;
    readonly containingSourceFile: Readonly<SourceFile>;
};
type TypescriptModuleResolutionMode = 'runtime' | 'type';
type PackageSpecifier = {
    readonly packageName: string;
    readonly subpath: string;
};
type PackageManifest = {
    readonly type: string | undefined;
    readonly exports: unknown;
    readonly main: string | undefined;
};
type RuntimePackageResolution = {
    readonly filePath: string | undefined;
    readonly canUseTypeFallback: boolean;
};
type RuntimeRelativeResolution = {
    readonly filePath: string | undefined;
    readonly canUseTypeFallback: boolean;
};
type TargetResolver = (value: unknown) => string | undefined;

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
    return specifier.startsWith('.') || path.isAbsolute(specifier);
}

function scopedPackageSpecifierFrom(specifier: string): PackageSpecifier | undefined {
    const [ scope, name, ...rest ] = specifier.split('/');
    if (name === undefined) {
        return undefined;
    }
    return {
        packageName: `${scope}/${name}`,
        subpath: rest.length === 0 ? '.' : `./${rest.join('/')}`
    };
}

function unscopedPackageSpecifierFrom(specifier: string): PackageSpecifier {
    const [ packageName = specifier, ...rest ] = specifier.split('/');
    return {
        packageName,
        subpath: rest.length === 0 ? '.' : `./${rest.join('/')}`
    };
}

function packageSpecifierFrom(specifier: string): PackageSpecifier | undefined {
    if (isRelativeOrAbsoluteSpecifier(specifier) || specifier.startsWith('#')) {
        return undefined;
    }
    return specifier.startsWith('@') ? scopedPackageSpecifierFrom(specifier) : unscopedPackageSpecifierFrom(specifier);
}

function hostFileExists(sourceFile: Readonly<SourceFile>, filePath: string): boolean {
    return sourceFile.getProject().getModuleResolutionHost().fileExists(filePath);
}

function hostReadFile(sourceFile: Readonly<SourceFile>, filePath: string): string | undefined {
    return sourceFile.getProject().getModuleResolutionHost().readFile(filePath);
}

function ancestorFolderPaths(startPath: string): readonly string[] {
    const start = path.resolve(startPath);
    const { root } = path.parse(start);
    const directorySegments = path
        .relative(root, start)
        .split(path.sep);

    return Array.from({ length: directorySegments.length + 1 }, function (_unusedValue, ancestorOffset) {
        return path.join(root, ...directorySegments.slice(0, directorySegments.length - ancestorOffset));
    });
}

function packageLookupDirectories(containingSourceFile: Readonly<SourceFile>): readonly string[] {
    return ancestorFolderPaths(path.dirname(containingSourceFile.getFilePath()));
}

function packageRootPath(
    specifier: PackageSpecifier,
    containingSourceFile: Readonly<SourceFile>
): string | undefined {
    for (const directory of packageLookupDirectories(containingSourceFile)) {
        const packageRoot = path.join(directory, 'node_modules', specifier.packageName);
        if (hostFileExists(containingSourceFile, path.join(packageRoot, 'package.json'))) {
            return packageRoot;
        }
    }
    return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringProperty(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
}

function parseJsonObject(content: string): unknown {
    let parsed: unknown = null;
    try {
        parsed = JSON.parse(content) as unknown;
    } catch {
    }
    return parsed;
}

function parsePackageManifest(content: string): Readonly<Record<string, unknown>> | undefined {
    const parsed = parseJsonObject(content);
    return isRecord(parsed) ? parsed : undefined;
}

function readPackageManifest(
    packageRoot: string,
    containingSourceFile: Readonly<SourceFile>
): PackageManifest | undefined {
    const filePath = path.join(packageRoot, 'package.json');
    const parsed = parsePackageManifest(String(hostReadFile(containingSourceFile, filePath)));
    if (parsed === undefined) {
        return undefined;
    }
    return {
        type: stringProperty(parsed, 'type'),
        exports: parsed.exports,
        main: stringProperty(parsed, 'main')
    };
}

function packageManifestPathsFor(filePath: string): readonly string[] {
    return ancestorFolderPaths(path.dirname(filePath)).map(function (folderPath) {
        return path.join(folderPath, 'package.json');
    });
}

export function packageTypeForResolvedFilePath(input: PackageTypeLookup): string | undefined {
    const { containingSourceFile, filePath } = input;
    for (const packageJsonPath of packageManifestPathsFor(filePath)) {
        if (hostFileExists(containingSourceFile, packageJsonPath)) {
            const manifest = parsePackageManifest(String(hostReadFile(containingSourceFile, packageJsonPath)));
            return manifest === undefined ? undefined : stringProperty(manifest, 'type');
        }
    }
    return undefined;
}

function targetFromConditionArray(value: unknown, resolveTarget: TargetResolver): string | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    for (const entry of value) {
        const target = resolveTarget(entry);
        if (target !== undefined) {
            return target;
        }
    }
    return undefined;
}

function targetFromConditionRecord(value: unknown, resolveTarget: TargetResolver): string | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    return resolveTarget(value.import) ?? resolveTarget(value.default);
}

function targetFromCondition(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    return targetFromConditionArray(value, targetFromCondition) ??
        targetFromConditionRecord(value, targetFromCondition);
}

function targetFromRootExports(exportsValue: unknown): string | undefined {
    if (typeof exportsValue === 'string' || Array.isArray(exportsValue)) {
        return targetFromCondition(exportsValue);
    }
    if (!isRecord(exportsValue)) {
        return undefined;
    }
    const rootTarget = exportsValue['.'];
    return targetFromCondition(rootTarget === undefined ? exportsValue : rootTarget);
}

function targetFromSubpathExports(exportsValue: unknown, subpath: string): string | undefined {
    return isRecord(exportsValue) ? targetFromCondition(exportsValue[subpath]) : undefined;
}

function targetFromExports(exportsValue: unknown, subpath: string): string | undefined {
    return subpath === '.'
        ? targetFromRootExports(exportsValue)
        : targetFromSubpathExports(exportsValue, subpath);
}

function manifestFallbackTarget(manifest: PackageManifest): string | undefined {
    return manifest.type === 'module' ? manifest.main : undefined;
}

function targetPathInsidePackage(packageRoot: string, target: string): string | undefined {
    const resolved = path.resolve(packageRoot, target);
    return resolved.startsWith(`${path.resolve(packageRoot)}${path.sep}`) ? resolved : undefined;
}

function runtimePackageFilePath(
    packageRoot: string,
    manifest: PackageManifest,
    specifier: PackageSpecifier
): string | undefined {
    const target = targetFromExports(manifest.exports, specifier.subpath) ?? manifestFallbackTarget(manifest);
    return target === undefined ? undefined : targetPathInsidePackage(packageRoot, target);
}

function runtimePackageResolution(
    moduleSpecifier: string,
    containingSourceFile: Readonly<SourceFile>
): RuntimePackageResolution {
    const specifier = packageSpecifierFrom(moduleSpecifier);
    if (specifier === undefined) {
        return { filePath: undefined, canUseTypeFallback: true };
    }
    const packageRoot = packageRootPath(specifier, containingSourceFile);
    if (packageRoot === undefined) {
        return { filePath: undefined, canUseTypeFallback: true };
    }
    const manifest = readPackageManifest(packageRoot, containingSourceFile);
    return {
        filePath: manifest === undefined ? undefined : runtimePackageFilePath(packageRoot, manifest, specifier),
        canUseTypeFallback: false
    };
}

function runtimeRelativeResolution(
    moduleSpecifier: string,
    containingSourceFile: Readonly<SourceFile>
): RuntimeRelativeResolution {
    if (!isRelativeOrAbsoluteSpecifier(moduleSpecifier)) {
        return { filePath: undefined, canUseTypeFallback: true };
    }
    const resolved = path.resolve(path.dirname(containingSourceFile.getFilePath()), moduleSpecifier);
    const candidates = path.extname(resolved) === ''
        ? [ resolved, `${resolved}.mjs`, `${resolved}.js` ]
        : [ resolved ];
    return {
        filePath: candidates.find(function (candidate) {
            return hostFileExists(containingSourceFile, candidate);
        }),
        canUseTypeFallback: false
    };
}

function typeResolution(
    moduleSpecifier: string,
    containingSourceFile: Readonly<SourceFile>
): string | undefined {
    const project = containingSourceFile.getProject();
    return ts
        .resolveModuleName(
            moduleSpecifier,
            containingSourceFile.getFilePath(),
            project.getCompilerOptions(),
            project.getModuleResolutionHost()
        )
        .resolvedModule
        ?.resolvedFileName;
}

export function resolveTypescriptModuleFilePath(
    input: TypescriptModuleFilePathResolution
): string | undefined {
    const { containingSourceFile, moduleSpecifier, resolutionMode } = input;
    const resolutionByMode = new Map<string, () => string | undefined>([
        [ 'type', function () {
            return typeResolution(moduleSpecifier, containingSourceFile);
        } ],
        [ 'runtime', function () {
            const relativeResolution = runtimeRelativeResolution(moduleSpecifier, containingSourceFile);
            const packageResolution = runtimePackageResolution(moduleSpecifier, containingSourceFile);
            return relativeResolution.filePath ??
                packageResolution.filePath ??
                (relativeResolution.canUseTypeFallback && packageResolution.canUseTypeFallback
                    ? typeResolution(moduleSpecifier, containingSourceFile)
                    : undefined);
        } ]
    ]);
    const resolve = resolutionByMode.get(resolutionMode);
    return resolve === undefined ? undefined : resolve();
}
