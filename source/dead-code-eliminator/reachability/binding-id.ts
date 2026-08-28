import type { Node as TsMorphNode } from 'ts-morph';
import { declarationCompanionCandidates } from '../../common/declaration-companion-paths.ts';
import type { DeclarationNodeIndex } from './identifier-target-collector.ts';
import type { BindingDescriptor } from './binding-extractor.ts';

export type FileBindingSet = {
    readonly sourceFilePath: string;
    readonly bindings: readonly BindingDescriptor[];
};

type BindingIdsByName = ReadonlyMap<string, string>;
type DeclarationIdsByName = ReadonlyMap<string, readonly string[]>;

export function bindingId(filePath: string, name: string): string {
    return `${filePath}::${name}`;
}

function bindingIdsByFile(files: readonly FileBindingSet[]): Map<string, BindingIdsByName> {
    const result = new Map<string, BindingIdsByName>();
    for (const file of files) {
        result.set(
            file.sourceFilePath,
            new Map(
                file.bindings.map(function (binding) {
                    return [ binding.name, bindingId(file.sourceFilePath, binding.name) ];
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
    for (const [ sourceFilePath, bindingIds ] of idsByFile) {
        if (declarationCompanionCandidates(sourceFilePath).includes(file.sourceFilePath)) {
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
        bindingId(file.sourceFilePath, binding.name),
        ...companionId === undefined ? [] : [ companionId ]
    ];
}

export function buildDeclarationNodeIndex(files: readonly FileBindingSet[]): DeclarationNodeIndex {
    const idsByNode = new Map<TsMorphNode, readonly string[]>();
    const idsByFileAndName = new Map<string, DeclarationIdsByName>();
    const idsByFile = bindingIdsByFile(files);
    function addFileDeclarationIds(file: FileBindingSet): void {
        const idsByName = new Map<string, readonly string[]>();
        for (const binding of file.bindings) {
            const bindingIds = declarationBindingIds(binding, file, idsByFile);
            idsByNode.set(binding.declarationNode, bindingIds);
            idsByName.set(binding.name, bindingIds);
        }
        idsByFileAndName.set(file.sourceFilePath, idsByName);
    }

    for (const file of files) {
        addFileDeclarationIds(file);
    }
    return { idsByNode, idsByFileAndName };
}

export function buildBindingsByFile(files: readonly FileBindingSet[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const file of files) {
        const ids = new Set<string>();
        for (const binding of file.bindings) {
            ids.add(bindingId(file.sourceFilePath, binding.name));
        }
        map.set(file.sourceFilePath, ids);
    }
    return map;
}

export function buildNodeById(files: readonly FileBindingSet[]): Map<string, TsMorphNode> {
    const map = new Map<string, TsMorphNode>();
    for (const file of files) {
        for (const binding of file.bindings) {
            map.set(bindingId(file.sourceFilePath, binding.name), binding.referenceNode);
        }
    }
    return map;
}
