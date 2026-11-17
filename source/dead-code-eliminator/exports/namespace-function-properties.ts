import { SyntaxKind, type Node as TypeScriptMorphNode } from 'ts-morph';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { localBindingReferences } from '../reference-target.ts';
import {
    createNamespaceReadObservation,
    type CalledNamespaceProperties
} from '../reachability/namespace-read-observation.ts';
import { stableReceiverFunction, type BindingStability } from './namespace-receiver-analysis.ts';

export function bindingReceiverProperties(
    declaration: TypeScriptMorphNode | undefined,
    bindingIsStable: BindingStability,
    calledProperties: CalledNamespaceProperties
): ReadonlySet<string> | undefined {
    const target = stableReceiverFunction(declaration, bindingIsStable);
    if (target === undefined || hasDynamicScope(target.getSourceFile())) {
        return undefined;
    }
    const observation = createNamespaceReadObservation(localBindingReferences, calledProperties);
    return target.getDescendantsOfKind(SyntaxKind.ThisKeyword).every(observation.observe)
        ? observation.properties
        : undefined;
}
