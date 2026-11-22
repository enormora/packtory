import type { Expression } from 'ts-morph';
import {
    receiverBinding,
    type BindingStability
} from './namespace-receiver-analysis.ts';
import { createNamespaceCallProperties } from './namespace-call-properties.ts';
import {
    allNamespaceProperties,
    type NamespaceDemand
} from './namespace-demand.ts';
import type { ModuleExportIndex } from './module-export-index.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';

type ReceiverProperties = (name: string) => ReadonlySet<string> | undefined;

function receiverPropertyDemand(properties: ReadonlySet<string> | undefined): NamespaceDemand {
    return properties === undefined ? allNamespaceProperties : new Map(Array.from(properties, function (property) {
        return [ property, allNamespaceProperties ];
    }));
}

export function createNamespaceReceiverDemand(
    index: ModuleExportIndex,
    resolveModule: ExportTargetResolver,
    bindingIsStable: BindingStability
): (receiver: Expression, name: string) => NamespaceDemand {
    const readsByReceiver = new WeakMap<Expression, ReceiverProperties>();
    return function (receiver, name) {
        const reads = readsByReceiver.get(receiver) ?? createNamespaceCallProperties(function (property) {
            return receiverBinding(receiver, property, index, resolveModule)?.declarationNode;
        }, bindingIsStable);
        readsByReceiver.set(receiver, reads);
        return receiverPropertyDemand(reads(name));
    };
}
