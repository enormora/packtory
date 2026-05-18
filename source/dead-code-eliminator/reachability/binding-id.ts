import type { Node as TsMorphNode } from 'ts-morph';
import type { BindingDescriptor } from './binding-extractor.ts';

export type FileBindingSet = {
    readonly sourceFilePath: string;
    readonly bindings: readonly BindingDescriptor[];
};

export function bindingId(filePath: string, name: string): string {
    return `${filePath}::${name}`;
}

export function buildDeclarationNodeIndex(files: readonly FileBindingSet[]): Map<TsMorphNode, string> {
    const index = new Map<TsMorphNode, string>();
    for (const file of files) {
        for (const binding of file.bindings) {
            index.set(binding.declarationNode, bindingId(file.sourceFilePath, binding.name));
        }
    }
    return index;
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
