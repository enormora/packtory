import type { Node as TypeScriptMorphNode } from 'ts-morph';
import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import type { DeclarationNodeIndex } from './identifier-target-collector.ts';
import type { BindingDescriptor } from './binding-extractor.ts';

export type FileBindingSet = {
    readonly inputFilePath: string;
    readonly parsedInputFilePath: string;
    readonly targetFilePath: string;
    readonly moduleReferences: readonly ArtifactModuleReference[];
    readonly bindings: readonly BindingDescriptor[];
};

type BindingIdentifiersByName = ReadonlyMap<string, string>;
type DeclarationIdentifiersByName = ReadonlyMap<string, readonly string[]>;
type DeclarationNodeEntry = readonly [TypeScriptMorphNode, readonly string[]];
type FileDeclarationIdentifiers = {
    readonly identifiersByName: DeclarationIdentifiersByName;
    readonly identifiersByNode: readonly DeclarationNodeEntry[];
};
type InputFilePath = {
    readonly getFilePath: () => string;
};
type InputFilePathNode = {
    readonly getSourceFile: () => InputFilePath;
};

export function bindingIdentifier(filePath: string, name: string): string {
    return `${filePath}::${name}`;
}

function bindingIdentifiersByFile(files: readonly FileBindingSet[]): Map<string, BindingIdentifiersByName> {
    const result = new Map<string, BindingIdentifiersByName>();
    for (const file of files) {
        result.set(
            file.targetFilePath,
            new Map(
                file.bindings.map(function (binding) {
                    return [ binding.name, bindingIdentifier(file.targetFilePath, binding.name) ];
                })
            )
        );
    }
    return result;
}

function companionBindingIdentifier(
    binding: BindingDescriptor,
    file: FileBindingSet,
    identifiersByFile: ReadonlyMap<string, BindingIdentifiersByName>
): string | undefined {
    for (const [ targetFilePath, bindingIdentifiers ] of identifiersByFile) {
        if (declarationCompanionCandidates(targetFilePath).includes(file.targetFilePath)) {
            return bindingIdentifiers.get(binding.name);
        }
    }
    return undefined;
}

function declarationBindingIdentifiers(
    binding: BindingDescriptor,
    file: FileBindingSet,
    identifiersByFile: ReadonlyMap<string, BindingIdentifiersByName>
): readonly string[] {
    const companionIdentifier = companionBindingIdentifier(binding, file, identifiersByFile);
    return [
        bindingIdentifier(file.targetFilePath, binding.name),
        ...companionIdentifier === undefined ? [] : [ companionIdentifier ]
    ];
}

function inputFilePathFromDeclaration(declarationNode: TypeScriptMorphNode): string | undefined {
    const node = declarationNode as Partial<InputFilePathNode>;
    return node.getSourceFile?.().getFilePath();
}

function bindingIdentifiersForFile(
    file: FileBindingSet,
    identifiersByFile: ReadonlyMap<string, BindingIdentifiersByName>
): FileDeclarationIdentifiers {
    const identifiersByName = new Map<string, readonly string[]>();
    const identifiersByNode: DeclarationNodeEntry[] = [];
    for (const binding of file.bindings) {
        const bindingIdentifiers = declarationBindingIdentifiers(binding, file, identifiersByFile);
        identifiersByNode.push([ binding.declarationNode, bindingIdentifiers ]);
        identifiersByName.set(binding.name, bindingIdentifiers);
    }
    return { identifiersByName, identifiersByNode };
}

function parsedDeclarationInputFilePaths(file: FileBindingSet): readonly string[] {
    return file.bindings.flatMap(function (binding) {
        const declarationInputFilePath = inputFilePathFromDeclaration(binding.declarationNode);
        return declarationInputFilePath === undefined ? [] : [ declarationInputFilePath ];
    });
}

function parsedPathsForTarget(file: FileBindingSet): readonly string[] {
    return [
        file.parsedInputFilePath,
        ...parsedDeclarationInputFilePaths(file)
    ];
}

export function buildDeclarationNodeIndex(files: readonly FileBindingSet[]): DeclarationNodeIndex {
    const index = {
        identifiersByNode: new Map<TypeScriptMorphNode, readonly string[]>(),
        identifiersByFileAndName: new Map<string, DeclarationIdentifiersByName>(),
        identifiersByTargetFileAndName: new Map<string, DeclarationIdentifiersByName>(),
        moduleReferencesByTargetFilePath: new Map<string, readonly ArtifactModuleReference[]>(),
        targetFilePathByInputFilePath: new Map<string, string>()
    };
    const identifiersByFile = bindingIdentifiersByFile(files);

    function addFilePathEntries(file: FileBindingSet, identifiersByName: DeclarationIdentifiersByName): void {
        index.identifiersByFileAndName.set(file.inputFilePath, identifiersByName);
        index.identifiersByFileAndName.set(file.parsedInputFilePath, identifiersByName);
        index.identifiersByFileAndName.set(file.targetFilePath, identifiersByName);
        index.identifiersByTargetFileAndName.set(file.targetFilePath, identifiersByName);
        index.moduleReferencesByTargetFilePath.set(file.targetFilePath, file.moduleReferences);
        for (const parsedPath of parsedPathsForTarget(file)) {
            index.identifiersByFileAndName.set(parsedPath, identifiersByName);
            index.targetFilePathByInputFilePath.set(parsedPath, file.targetFilePath);
        }
    }

    function addFileDeclarationIdentifiers(file: FileBindingSet): void {
        const { identifiersByName, identifiersByNode: nodeIdentifiers } = bindingIdentifiersForFile(
            file,
            identifiersByFile
        );
        for (const [ node, bindingIdentifiers ] of nodeIdentifiers) {
            index.identifiersByNode.set(node, bindingIdentifiers);
        }
        addFilePathEntries(file, identifiersByName);
    }

    for (const file of files) {
        addFileDeclarationIdentifiers(file);
    }
    return index;
}

export function buildBindingsByFile(files: readonly FileBindingSet[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const file of files) {
        const identifiers = new Set<string>();
        for (const binding of file.bindings) {
            identifiers.add(bindingIdentifier(file.targetFilePath, binding.name));
        }
        map.set(file.targetFilePath, identifiers);
    }
    return map;
}

export function buildNodeByIdentifier(files: readonly FileBindingSet[]): Map<string, TypeScriptMorphNode> {
    const map = new Map<string, TypeScriptMorphNode>();
    for (const file of files) {
        for (const binding of file.bindings) {
            map.set(bindingIdentifier(file.targetFilePath, binding.name), binding.referenceNode);
        }
    }
    return map;
}
