import type { Node as TypeScriptMorphNode } from 'ts-morph';
import { visitBindingDependencies } from './binding-dependencies.ts';
import { bindingReceiverProperties } from './namespace-function-properties.ts';
import type { BindingStability } from './namespace-receiver-analysis.ts';

type FunctionReads = {
    readonly properties: ReadonlySet<string> | undefined;
    readonly calls: ReadonlySet<string>;
};
type ReceiverProperties = (name: string) => ReadonlySet<string> | undefined;

function functionReads(declaration: TypeScriptMorphNode | undefined, bindingIsStable: BindingStability): FunctionReads {
    const calls = new Set<string>();
    const properties = bindingReceiverProperties(declaration, bindingIsStable, function (name) {
        calls.add(name);
        return new Set<string>();
    });
    return { properties, calls };
}

export function createNamespaceCallProperties(
    resolveDeclaration: (name: string) => TypeScriptMorphNode | undefined,
    bindingIsStable: BindingStability
): ReceiverProperties {
    const functions = new Map<string, FunctionReads>();
    function readsFor(name: string): FunctionReads {
        const reads = functions.get(name) ?? functionReads(resolveDeclaration(name), bindingIsStable);
        functions.set(name, reads);
        return reads;
    }
    return function (name) {
        const properties = new Set<string>();
        const unknownFunctions = new Set<string>();
        visitBindingDependencies(name, {
            get(key) {
                return function () {
                    return readsFor(key).calls;
                };
            }
        }, function (key) {
            const reads = readsFor(key);
            if (reads.properties === undefined) {
                unknownFunctions.add(key);
            } else {
                for (const property of reads.properties) {
                    properties.add(property);
                }
            }
        });
        return unknownFunctions.size === 0 ? properties : undefined;
    };
}
