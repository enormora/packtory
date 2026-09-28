import path from 'node:path';
import { execFile } from 'node:child_process';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, ts as typescript } from 'ts-morph';
import type { FileManager } from '../../file-manager/file-manager.ts';
import {
    binTargetsFromBinField,
    runtimeExportsFromExportsField
} from '../../packtory/published-artifact-smoke-gate.ts';

type PackageFolder = {
    readonly name: string;
    readonly folderPath: string;
};

export type TypeExportNames = {
    readonly namespace: readonly string[];
    readonly type: readonly string[];
    readonly value: readonly string[];
};

export type PublicExportApi = {
    readonly runtimeExportNames: readonly string[];
    readonly runtimeImportError: string;
    readonly specifier: string;
    readonly typeExportNames: TypeExportNames;
};

type PackageApi = {
    readonly binTargets: readonly string[];
    readonly name: string;
    readonly publicExports: readonly PublicExportApi[];
    readonly typeDiagnostics: readonly string[];
};

export type PackageApiInspection = {
    readonly packages: readonly PackageApi[];
};

type InspectPackagesInput = {
    readonly fileManager: Pick<FileManager, 'checkReadability' | 'listDirectoryEntries' | 'readFile'>;
    readonly nodeModulesFolder: string;
    readonly runImportProbe: (cwd: string, specifier: string) => Promise<readonly string[]>;
};

type TypeInspection = {
    readonly diagnostics: readonly string[];
    readonly exportsBySpecifier: ReadonlyMap<string, TypeExportNames>;
};

type RuntimeNames = {
    readonly error: string;
    readonly names: readonly string[];
};

type Manifest = {
    readonly bin: unknown;
    readonly exports: unknown;
    readonly name: string;
};

const successfulImport = '';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function parseManifest(content: string, manifestPath: string): Manifest {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed) || typeof parsed.name !== 'string') {
        throw new Error(`Package manifest "${manifestPath}" is missing a string name`);
    }
    return {
        bin: parsed.bin,
        exports: parsed.exports,
        name: parsed.name
    };
}

async function packageFoldersInScope(
    fileManager: Pick<FileManager, 'listDirectoryEntries'>,
    scopeFolder: string,
    scopeName: string
): Promise<readonly PackageFolder[]> {
    const entries = await fileManager.listDirectoryEntries(scopeFolder);
    return entries
        .filter(function (entry) {
            return entry.isDirectory;
        })
        .map(function (entry) {
            return {
                name: `${scopeName}/${entry.name}`,
                folderPath: path.join(scopeFolder, entry.name)
            };
        });
}

async function packageFolders(input: InspectPackagesInput): Promise<readonly PackageFolder[]> {
    const entries = await input.fileManager.listDirectoryEntries(input.nodeModulesFolder);
    const folderGroups = await Promise.all(entries.flatMap(async function (entry): Promise<readonly PackageFolder[]> {
        if (!entry.isDirectory) {
            return [];
        }
        const folderPath = path.join(input.nodeModulesFolder, entry.name);
        return entry.name.startsWith('@')
            ? await packageFoldersInScope(input.fileManager, folderPath, entry.name)
            : [ { name: entry.name, folderPath } ];
    }));
    const folders = folderGroups.flat();
    return folders.toSorted(function (left, right) {
        return left.name.localeCompare(right.name);
    });
}

function diagnosticMessage(diagnostic: Readonly<typescript.Diagnostic>): string {
    const message = typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    return `TS${diagnostic.code}: ${message}`;
}

function typeSourceFor(specifiers: readonly string[]): string {
    return specifiers
        .map(function (specifier, index) {
            return `import * as api${index} from ${JSON.stringify(specifier)};\nvoid api${index};`;
        })
        .join('\n');
}

function compareStrings(left: string, right: string): number {
    return left.localeCompare(right);
}

function symbolHasNamespaceDeclaration(symbol: Readonly<typescript.Symbol>): boolean {
    return symbol.getDeclarations()?.some(typescript.isModuleDeclaration) === true;
}

function symbolHasTypeDeclaration(symbol: Readonly<typescript.Symbol>): boolean {
    return symbol.getDeclarations()?.some(function (declaration) {
        return typescript.isClassDeclaration(declaration) ||
            typescript.isEnumDeclaration(declaration) ||
            typescript.isInterfaceDeclaration(declaration) ||
            typescript.isTypeAliasDeclaration(declaration);
    }) === true;
}

function symbolHasValueDeclaration(symbol: Readonly<typescript.Symbol>): boolean {
    return symbol.getDeclarations()?.some(function (declaration) {
        return typescript.isClassDeclaration(declaration) ||
            typescript.isEnumDeclaration(declaration) ||
            typescript.isFunctionDeclaration(declaration) ||
            typescript.isModuleDeclaration(declaration) ||
            typescript.isVariableDeclaration(declaration);
    }) === true;
}

function appendSymbolName(
    symbol: Readonly<typescript.Symbol>,
    names: TypeExportNames,
    name: string
): TypeExportNames {
    return {
        namespace: symbolHasNamespaceDeclaration(symbol) ? [ ...names.namespace, name ] : names.namespace,
        type: symbolHasTypeDeclaration(symbol) ? [ ...names.type, name ] : names.type,
        value: symbolHasValueDeclaration(symbol) ? [ ...names.value, name ] : names.value
    };
}

function typeExportNames(symbols: readonly typescript.Symbol[]): TypeExportNames {
    const names = symbols.reduce<TypeExportNames>(function (collected, symbol) {
        return appendSymbolName(symbol, collected, symbol.getName());
    }, { namespace: [], type: [], value: [] });
    return {
        namespace: names.namespace.toSorted(compareStrings),
        type: names.type.toSorted(compareStrings),
        value: names.value.toSorted(compareStrings)
    };
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(function (entry) {
        return typeof entry === 'string';
    });
}

function parseImportProbeOutput(output: string): readonly string[] {
    const parsed: unknown = JSON.parse(output);
    if (!isStringArray(parsed)) {
        throw new Error('Import probe did not print a string array');
    }
    return parsed;
}

function importProbeFailureMessage(error: Error, stdout: string, stderr: string): string {
    const stderrOutput = stderr.trim();
    const stdoutOutput = stdout.trim();
    if (stderrOutput.length > 0) {
        return stderrOutput;
    }
    return stdoutOutput.length > 0 ? stdoutOutput : error.message;
}

function createTypeProject(cwd: string, specifiers: readonly string[]): Project {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
        compilerOptions: {
            module: ModuleKind.Node16,
            moduleResolution: ModuleResolutionKind.Node16,
            noEmit: true,
            resolveJsonModule: true,
            skipLibCheck: false,
            strict: true,
            target: ScriptTarget.ESNext
        }
    });
    project.createSourceFile(path.join(cwd, 'packtory-canary-type-probe.ts'), typeSourceFor(specifiers));
    return project;
}

function moduleSymbolExports(project: Project, specifier: string): TypeExportNames {
    const sourceFile = project.getSourceFileOrThrow('packtory-canary-type-probe.ts');
    const declaration = sourceFile.getImportDeclarations().find(function (candidate) {
        return candidate.getModuleSpecifierValue() === specifier;
    });
    const symbol = declaration === undefined
        ? undefined
        : project.getTypeChecker().compilerObject.getSymbolAtLocation(declaration.getModuleSpecifier().compilerNode);
    return symbol === undefined
        ? { namespace: [], type: [], value: [] }
        : typeExportNames(project.getTypeChecker().compilerObject.getExportsOfModule(symbol));
}

function inspectTypes(cwd: string, specifiers: readonly string[]): TypeInspection {
    if (specifiers.length === 0) {
        return { diagnostics: [], exportsBySpecifier: new Map() };
    }
    const project = createTypeProject(cwd, specifiers);
    const diagnostics = project
        .getPreEmitDiagnostics()
        .map(function (diagnostic) {
            return diagnosticMessage(diagnostic.compilerObject);
        })
        .toSorted(compareStrings);
    return {
        diagnostics,
        exportsBySpecifier: new Map(
            specifiers.map(function (specifier) {
                return [ specifier, moduleSymbolExports(project, specifier) ];
            })
        )
    };
}

async function runtimeNamesForTarget(
    input: InspectPackagesInput,
    specifier: string
): Promise<RuntimeNames> {
    try {
        return { error: successfulImport, names: await input.runImportProbe(input.nodeModulesFolder, specifier) };
    } catch (error: unknown) {
        return { error: error instanceof Error ? error.message : String(error), names: [] };
    }
}

async function inspectPackage(
    input: InspectPackagesInput,
    packageFolder: PackageFolder
): Promise<PackageApi> {
    const manifestPath = path.join(packageFolder.folderPath, 'package.json');
    const manifest = parseManifest(await input.fileManager.readFile(manifestPath), manifestPath);
    const targets = runtimeExportsFromExportsField(manifest.name, manifest.exports);
    const typeInspection = inspectTypes(
        input.nodeModulesFolder,
        targets.map(function (target) {
            return target.specifier;
        })
    );
    const publicExports = await Promise.all(targets.map(async function (target): Promise<PublicExportApi> {
        const runtime = await runtimeNamesForTarget(input, target.specifier);
        return {
            runtimeExportNames: runtime.names,
            runtimeImportError: runtime.error,
            specifier: target.specifier,
            typeExportNames: typeInspection.exportsBySpecifier.get(target.specifier) ?? {
                namespace: [],
                type: [],
                value: []
            }
        };
    }));
    return {
        binTargets: binTargetsFromBinField(manifest.name, manifest.bin).map(function (target) {
            return `${target.name} -> ${target.targetFilePath}`;
        }),
        name: manifest.name,
        publicExports: publicExports.toSorted(function (left, right) {
            return left.specifier.localeCompare(right.specifier);
        }),
        typeDiagnostics: typeInspection.diagnostics
    };
}

export async function inspectPackageApis(input: InspectPackagesInput): Promise<PackageApiInspection> {
    const readability = await input.fileManager.checkReadability(input.nodeModulesFolder);
    if (!readability.isReadable) {
        throw new Error(`Generated package folder "${input.nodeModulesFolder}" is not readable`);
    }
    const folders = await packageFolders(input);
    return {
        packages: await Promise.all(folders.map(async function (packageFolder) {
            return await inspectPackage(input, packageFolder);
        }))
    };
}

export async function runNodeImportProbe(cwd: string, specifier: string): Promise<readonly string[]> {
    const script = `
        try {
            const module = await import(${JSON.stringify(specifier)});
            console.log(JSON.stringify(Object.keys(module).sort()));
        } catch (error) {
            console.error(error instanceof Error ? error.stack ?? error.message : String(error));
            process.exitCode = 1;
        }
    `;
    return new Promise(function (resolve, reject) {
        execFile(
            process.execPath,
            [ '--enable-source-maps', '--input-type=module', '-e', script ],
            { cwd, encoding: 'utf8', timeout: 10_000 },
            function (error, stdout, stderr) {
                if (error !== null) {
                    reject(new Error(importProbeFailureMessage(error, stdout, stderr)));
                    return;
                }
                resolve(parseImportProbeOutput(stdout));
            }
        );
    });
}
