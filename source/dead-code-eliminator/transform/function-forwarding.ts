import path from 'node:path';
import { Node as TypeScriptMorphNode, type ExportDeclaration, type ImportDeclaration, type SourceFile } from 'ts-morph';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import type { LoadedResource, LoadedCodeResource } from '../load-resource.ts';
import { runtimeSourceIsValid } from '../runtime-source-validity.ts';
import { sourceReplacement } from './source-replacement.ts';

type ModuleRequest = ExportDeclaration | ImportDeclaration;
type LocalReference = Extract<ArtifactModuleReference, { readonly type: 'local-code'; }>;
type FunctionForwarding = {
    readonly targetFilePath: string;
    readonly names: ReadonlySet<string>;
};

function forwardingDeclaration(source: SourceFile): ExportDeclaration | undefined {
    const [ statement, additional ] = source.getStatements().filter(function (candidate) {
        return !TypeScriptMorphNode.isEmptyStatement(candidate);
    });
    if (
        additional !== undefined || !TypeScriptMorphNode.isExportDeclaration(statement) ||
        statement.getAttributes() !== undefined || !runtimeSourceIsValid(source)
    ) {
        return undefined;
    }
    return statement;
}

function forwardedFunctionNames(
    declaration: ExportDeclaration,
    destination: SourceFile
): ReadonlySet<string> | undefined {
    if (
        destination.getStatements().some(function (node) {
            return !TypeScriptMorphNode.isFunctionDeclaration(node) && !TypeScriptMorphNode.isEmptyStatement(node);
        }) || !runtimeSourceIsValid(destination)
    ) {
        return undefined;
    }
    const functions = new Set(
        destination.getFunctions().flatMap(function (candidate) {
            return candidate.hasExportKeyword() && !candidate.isDefaultExport()
                ? candidate.getNameNodeOrThrow().compilerNode.text
                : [];
        })
    );
    const exports = declaration.getNamedExports();
    if (
        exports.length === 0 || exports.some(function (exported) {
            return exported.getAliasNode() !== undefined || !functions.has(exported.getNameNode().compilerNode.text);
        })
    ) {
        return undefined;
    }
    return new Set(exports.map(function (exported) {
        return exported.getNameNode().compilerNode.text;
    }));
}

function forwardedFunctions(
    entry: LoadedCodeResource,
    modules: ReadonlyMap<string, LoadedCodeResource>
): FunctionForwarding | undefined {
    const declaration = forwardingDeclaration(entry.sourceFile);
    if (declaration === undefined) {
        return undefined;
    }
    const specifier = declaration.getModuleSpecifierValue();
    const target = entry.resource.moduleReferences.find(function (reference) {
        return reference.emittedSpecifier === specifier;
    });
    if (target?.type !== 'local-code') {
        return undefined;
    }
    const destination = modules.get(target.targetFilePath);
    const names = destination === undefined ? undefined : forwardedFunctionNames(declaration, destination.sourceFile);
    return names === undefined ? undefined : { targetFilePath: target.targetFilePath, names };
}

function requestsOnlyForwardedNames(request: ModuleRequest, names: ReadonlySet<string>): boolean {
    const specifiers = TypeScriptMorphNode.isImportDeclaration(request)
        ? request.getNamedImports()
        : request.getNamedExports();
    if (
        request.getAttributes() !== undefined ||
        (TypeScriptMorphNode.isImportDeclaration(request) && request.getDefaultImport() !== undefined)
    ) {
        return false;
    }
    return specifiers.length > 0 && specifiers.every(function (specifier) {
        return names.has(specifier.getNameNode().compilerNode.text);
    });
}

function relativeSpecifier(from: string, to: string): string | undefined {
    const relative = path.posix.relative(path.posix.dirname(from), to);
    if (!/^[\w./@-]+$/u.test(relative)) {
        return undefined;
    }
    return relative.startsWith('../') ? relative : `./${relative}`;
}

function redirectedReference(
    request: ModuleRequest,
    resource: LoadedCodeResource['resource'],
    forwarding: ReadonlyMap<string, FunctionForwarding>
): LocalReference | undefined {
    const specifier = request.getModuleSpecifierValue();
    const reference = resource.moduleReferences.find(function (candidate) {
        return candidate.emittedSpecifier === specifier;
    });
    if (reference?.type !== 'local-code') {
        return undefined;
    }
    const destination = forwarding.get(reference.targetFilePath);
    if (destination === undefined || !requestsOnlyForwardedNames(request, destination.names)) {
        return undefined;
    }
    const { targetFilePath } = destination;
    const emittedSpecifier = relativeSpecifier(resource.fileDescription.targetFilePath, targetFilePath);
    return emittedSpecifier === undefined ? undefined : { ...reference, emittedSpecifier, targetFilePath };
}

function redirectRequests(
    entry: LoadedCodeResource,
    forwarding: ReadonlyMap<string, FunctionForwarding>
): LoadedCodeResource {
    const { resource, sourceFile } = entry;
    const addedReferences = new Map<string, LocalReference>();
    const dependencies = new Set(resource.directDependencies);
    const requests = [ ...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations() ];
    const edits = requests.flatMap(function (request) {
        const literal = request.getModuleSpecifier();
        const redirect = redirectedReference(request, resource, forwarding);
        if (literal === undefined || redirect === undefined) {
            return [];
        }
        const existing = resource.moduleReferences.find(function (candidate) {
            return candidate.emittedSpecifier === redirect.emittedSpecifier;
        });
        if (existing === undefined) {
            addedReferences.set(redirect.emittedSpecifier, redirect);
        } else if (existing.type !== 'local-code' || existing.targetFilePath !== redirect.targetFilePath) {
            return [];
        }
        dependencies.add(redirect.targetFilePath);
        return sourceReplacement(literal, [ JSON.stringify(redirect.emittedSpecifier) ]);
    });
    if (edits.length === 0) {
        return entry;
    }
    entry.applyEdits(edits);
    return {
        ...entry,
        resource: {
            ...resource,
            directDependencies: dependencies,
            moduleReferences: [ ...resource.moduleReferences, ...addedReferences.values() ]
        }
    };
}

export function bypassFunctionForwarding(loaded: readonly LoadedResource[]): readonly LoadedResource[] {
    const modules = new Map(loaded.flatMap(function (entry) {
        const { targetFilePath } = entry.resource.fileDescription;
        return entry.sourceFile !== undefined && /\.m?js$/u.test(targetFilePath)
            ? [ [ targetFilePath, entry ] as const ]
            : [];
    }));
    const forwarding = new Map(
        Array.from(modules).flatMap(function ([ targetFilePath, entry ]) {
            const target = forwardedFunctions(entry, modules);
            return target === undefined ? [] : [ [ targetFilePath, target ] as const ];
        })
    );
    if (forwarding.size === 0) {
        return loaded;
    }
    return loaded.map(function (entry) {
        if (
            entry.sourceFile === undefined || !modules.has(entry.resource.fileDescription.targetFilePath) ||
            !runtimeSourceIsValid(entry.sourceFile)
        ) {
            return entry;
        }
        return redirectRequests(entry, forwarding);
    });
}
