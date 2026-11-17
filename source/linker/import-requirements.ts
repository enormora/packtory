import type { ExportDeclaration, ImportDeclaration, SourceFile } from 'ts-morph';
import { resolveTypescriptModuleFilePath } from '../dependency-scanner/typescript-module-resolution.ts';
import type { ImportPathReplacementRequest } from './replacement-lookup.ts';

function createReplacementRequest(inputFilePath: string): ImportPathReplacementRequest {
    return {
        inputFilePath,
        requiredExportNames: new Set(),
        requiresNamespaceExport: false
    };
}

type ImportRequirements = {
    readonly requireName: (inputFilePath: string, name: string) => void;
    readonly requireNamespace: (inputFilePath: string) => void;
    readonly requests: readonly ImportPathReplacementRequest[];
};

function createImportRequirements(directDependencies: ReadonlySet<string>): ImportRequirements {
    const requests = new Map(Array.from(directDependencies, function (path) {
        return [ path, createReplacementRequest(path) ];
    }));
    function requestFor(inputFilePath: string): ImportPathReplacementRequest {
        return requests.get(inputFilePath) ?? createReplacementRequest(inputFilePath);
    }
    return {
        requireName(inputFilePath, name) {
            const request = requestFor(inputFilePath);
            requests.set(inputFilePath, {
                ...request,
                requiredExportNames: new Set([ ...request.requiredExportNames, name ])
            });
        },
        requireNamespace(inputFilePath) {
            requests.set(inputFilePath, { ...requestFor(inputFilePath), requiresNamespaceExport: true });
        },
        get requests() {
            return Array.from(requests.values());
        }
    };
}

function referencedInputFilePath(declaration: ExportDeclaration | ImportDeclaration): string | undefined {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    if (moduleSpecifier === undefined) {
        return undefined;
    }
    const sourceFile = declaration.getSourceFile();
    return resolveTypescriptModuleFilePath({
        moduleSpecifier,
        containingSourceFile: sourceFile,
        containingFilePath: sourceFile.getFilePath(),
        resolutionMode: 'type'
    });
}

function recordImportRequirements(
    requirements: ImportRequirements,
    declaration: ImportDeclaration
): void {
    const inputFilePath = referencedInputFilePath(declaration);
    if (inputFilePath === undefined) {
        return;
    }
    if (declaration.getDefaultImport() !== undefined) {
        requirements.requireName(inputFilePath, 'default');
    }
    if (declaration.getNamespaceImport() !== undefined) {
        requirements.requireNamespace(inputFilePath);
    }
    for (const namedImport of declaration.getNamedImports()) {
        requirements.requireName(inputFilePath, namedImport.getName());
    }
}

function recordExportRequirements(
    requirements: ImportRequirements,
    declaration: ExportDeclaration
): void {
    const inputFilePath = referencedInputFilePath(declaration);
    if (inputFilePath === undefined) {
        return;
    }
    if (declaration.isNamespaceExport()) {
        requirements.requireNamespace(inputFilePath);
    }
    for (const namedExport of declaration.getNamedExports()) {
        requirements.requireName(inputFilePath, namedExport.getName());
    }
}

function recordStaticRequirements(
    requirements: ImportRequirements,
    sourceFile: SourceFile
): void {
    for (const declaration of sourceFile.getImportDeclarations()) {
        recordImportRequirements(requirements, declaration);
    }
    for (const declaration of sourceFile.getExportDeclarations()) {
        recordExportRequirements(requirements, declaration);
    }
}

export function collectImportRequirements(
    sourceFile: SourceFile | undefined,
    directDependencies: ReadonlySet<string>
): readonly ImportPathReplacementRequest[] {
    const requirements = createImportRequirements(directDependencies);
    if (sourceFile !== undefined) {
        recordStaticRequirements(requirements, sourceFile);
    }
    return requirements.requests;
}
