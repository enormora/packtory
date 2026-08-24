import path from 'node:path';
import { ts, type Project, type SourceFile } from 'ts-morph';

type PackageSpecifier = {
    readonly packageName: string;
    readonly subpath: string;
};

type PackageManifest = {
    readonly type: string | undefined;
    readonly exports: unknown;
    readonly main: string | undefined;
    readonly module: string | undefined;
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

function hostFileExists(sourceFile: SourceFile, filePath: string): boolean {
    return sourceFile.getProject().getModuleResolutionHost().fileExists(filePath);
}

function hostReadFile(sourceFile: SourceFile, filePath: string): string | undefined {
    return sourceFile.getProject().getModuleResolutionHost().readFile(filePath);
}

function packageLookupDirectories(containingSourceFile: SourceFile): readonly string[] {
    const start = path.resolve(path.dirname(containingSourceFile.getFilePath()));
    const { root } = path.parse(start);
    const directorySegments = path
        .relative(root, start)
        .split(path.sep);

    return Array.from({ length: directorySegments.length + 1 }, function (_unusedValue, ancestorOffset) {
        return path.join(root, ...directorySegments.slice(0, directorySegments.length - ancestorOffset));
    });
}

function packageRootPath(
    specifier: PackageSpecifier,
    containingSourceFile: SourceFile
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

function parsePackageManifest(filePath: string, content: string): Readonly<Record<string, unknown>> | undefined {
    const parsed = ts.parseConfigFileTextToJson(filePath, content);
    return parsed.error === undefined && isRecord(parsed.config) ? parsed.config : undefined;
}

function readPackageManifest(packageRoot: string, containingSourceFile: SourceFile): PackageManifest | undefined {
    const filePath = path.join(packageRoot, 'package.json');
    const parsed = parsePackageManifest(filePath, String(hostReadFile(containingSourceFile, filePath)));
    if (parsed === undefined) {
        return undefined;
    }
    return {
        type: stringProperty(parsed, 'type'),
        exports: parsed.exports,
        main: stringProperty(parsed, 'main'),
        module: stringProperty(parsed, 'module')
    };
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
    if (manifest.module !== undefined) {
        return manifest.module;
    }
    return manifest.type === 'module' ? manifest.main : undefined;
}

function targetIsEsm(resolved: string, manifest: PackageManifest): boolean {
    const extension = path.extname(resolved);
    return extension === '.mjs' || extension === '.js' && manifest.type === 'module';
}

function runtimeTargetPath(
    packageRoot: string,
    manifest: PackageManifest,
    specifier: PackageSpecifier
): string | undefined {
    const target = targetFromExports(manifest.exports, specifier.subpath) ?? manifestFallbackTarget(manifest);
    if (target === undefined) {
        return undefined;
    }
    const resolved = path.resolve(packageRoot, target);
    if (!resolved.startsWith(`${path.resolve(packageRoot)}${path.sep}`)) {
        return undefined;
    }
    return targetIsEsm(resolved, manifest) ? resolved : undefined;
}

function sourceFileAtPath(project: Project, filePath: string): SourceFile | undefined {
    return project.getSourceFile(filePath) ?? project.addSourceFileAtPathIfExists(filePath);
}

function resolvePackageSourceFile(
    specifier: PackageSpecifier,
    containingSourceFile: SourceFile
): SourceFile | undefined {
    const packageRoot = packageRootPath(specifier, containingSourceFile);
    if (packageRoot === undefined) {
        return undefined;
    }
    const manifest = readPackageManifest(packageRoot, containingSourceFile);
    const targetPath = manifest === undefined ? undefined : runtimeTargetPath(packageRoot, manifest, specifier);
    return targetPath === undefined ? undefined : sourceFileAtPath(containingSourceFile.getProject(), targetPath);
}

function resolveRelativeSourceFile(
    moduleSpecifier: string,
    containingSourceFile: SourceFile
): SourceFile | undefined {
    const project = containingSourceFile.getProject();
    const resolved = path.resolve(path.dirname(containingSourceFile.getFilePath()), moduleSpecifier);
    const candidates = [ resolved, `${resolved}.mjs`, `${resolved}.js` ];
    for (const candidate of candidates) {
        const sourceFile = sourceFileAtPath(project, candidate);
        if (sourceFile !== undefined) {
            return sourceFile;
        }
    }
    return undefined;
}

export function resolveModuleSourceFile(
    moduleSpecifier: string,
    containingSourceFile: SourceFile
): SourceFile | undefined {
    const specifier = packageSpecifierFrom(moduleSpecifier);
    if (specifier !== undefined) {
        return resolvePackageSourceFile(specifier, containingSourceFile);
    }
    return resolveRelativeSourceFile(moduleSpecifier, containingSourceFile);
}
