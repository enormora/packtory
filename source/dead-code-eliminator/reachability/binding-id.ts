import type { Node as TsMorphNode } from 'ts-morph';
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

type BindingIdsByName = ReadonlyMap<string, string>;
type DeclarationIdsByName = ReadonlyMap<string, readonly string[]>;
type DeclarationNodeEntry = readonly [TsMorphNode, readonly string[]];
type FileDeclarationIds = {
    readonly idsByName: DeclarationIdsByName;
    readonly idsByNode: readonly DeclarationNodeEntry[];
};
type InputFilePath = {
    readonly getFilePath: () => string;
};
type InputFilePathNode = {
    readonly getSourceFile: () => InputFilePath;
};

export function bindingId(filePath: string, name: string): string {
    return `${filePath}::${name}`;
}

function bindingIdsByFile(files: readonly FileBindingSet[]): Map<string, BindingIdsByName> {
    const result = new Map<string, BindingIdsByName>();
    for (const file of files) {
        result.set(
            file.targetFilePath,
            new Map(
                file.bindings.map(function (binding) {
                    return [ binding.name, bindingId(file.targetFilePath, binding.name) ];
                })
            )
        );
    }
    return result;
}

function companionBindingId(
    binding: BindingDescriptor,
    file: FileBindingSet,
    idsByFile: ReadonlyMap<string, BindingIdsByName>
): string | undefined {
    for (const [ targetFilePath, bindingIds ] of idsByFile) {
        if (declarationCompanionCandidates(targetFilePath).includes(file.targetFilePath)) {
            return bindingIds.get(binding.name);
        }
    }
    return undefined;
}

function declarationBindingIds(
    binding: BindingDescriptor,
    file: FileBindingSet,
    idsByFile: ReadonlyMap<string, BindingIdsByName>
): readonly string[] {
    const companionId = companionBindingId(binding, file, idsByFile);
    return [
        bindingId(file.targetFilePath, binding.name),
        ...companionId === undefined ? [] : [ companionId ]
    ];
}

function inputFilePathFromDeclaration(declarationNode: TsMorphNode): string | undefined {
    const node = declarationNode as Partial<InputFilePathNode>;
    return node.getSourceFile?.().getFilePath();
}

function bindingIdsForFile(
    file: FileBindingSet,
    idsByFile: ReadonlyMap<string, BindingIdsByName>
): FileDeclarationIds {
    const idsByName = new Map<string, readonly string[]>();
    const idsByNode: DeclarationNodeEntry[] = [];
    for (const binding of file.bindings) {
        const bindingIds = declarationBindingIds(binding, file, idsByFile);
        idsByNode.push([ binding.declarationNode, bindingIds ]);
        idsByName.set(binding.name, bindingIds);
    }
    return { idsByName, idsByNode };
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
        idsByNode: new Map<TsMorphNode, readonly string[]>(),
        idsByFileAndName: new Map<string, DeclarationIdsByName>(),
        idsByTargetFileAndName: new Map<string, DeclarationIdsByName>(),
        moduleReferencesByTargetFilePath: new Map<string, readonly ArtifactModuleReference[]>(),
        targetFilePathByInputFilePath: new Map<string, string>()
    };
    const idsByFile = bindingIdsByFile(files);

    function addFilePathEntries(file: FileBindingSet, idsByName: DeclarationIdsByName): void {
        index.idsByFileAndName.set(file.inputFilePath, idsByName);
        index.idsByFileAndName.set(file.parsedInputFilePath, idsByName);
        index.idsByFileAndName.set(file.targetFilePath, idsByName);
        index.idsByTargetFileAndName.set(file.targetFilePath, idsByName);
        index.moduleReferencesByTargetFilePath.set(file.targetFilePath, file.moduleReferences);
        for (const parsedPath of parsedPathsForTarget(file)) {
            index.idsByFileAndName.set(parsedPath, idsByName);
            index.targetFilePathByInputFilePath.set(parsedPath, file.targetFilePath);
        }
    }

    function addFileDeclarationIds(file: FileBindingSet): void {
        const { idsByName, idsByNode: nodeIds } = bindingIdsForFile(file, idsByFile);
        for (const [ node, bindingIds ] of nodeIds) {
            index.idsByNode.set(node, bindingIds);
        }
        addFilePathEntries(file, idsByName);
    }

    for (const file of files) {
        addFileDeclarationIds(file);
    }
    return index;
}

export function buildBindingsByFile(files: readonly FileBindingSet[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const file of files) {
        const ids = new Set<string>();
        for (const binding of file.bindings) {
            ids.add(bindingId(file.targetFilePath, binding.name));
        }
        map.set(file.targetFilePath, ids);
    }
    return map;
}

export function buildNodeById(files: readonly FileBindingSet[]): Map<string, TsMorphNode> {
    const map = new Map<string, TsMorphNode>();
    for (const file of files) {
        for (const binding of file.bindings) {
            map.set(bindingId(file.targetFilePath, binding.name), binding.referenceNode);
        }
    }
    return map;
}
