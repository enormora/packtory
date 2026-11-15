import { Node as TypeScriptMorphNode, type CallExpression, type SourceFile } from 'ts-morph';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { expressionWithWrappers } from '../expression-unwrapping.ts';
import { localBindingReferences } from '../reference-target.ts';
import { bindingValueIsStable } from '../binding-stability.ts';
import { bindingIgnoresReceiver } from '../exports/namespace-receiver-analysis.ts';
import { createNamespaceReadObservation } from './namespace-read-observation.ts';

function namespaceMayResolveAnotherValue(target: SourceFile): boolean {
    return target.getExportSymbols().some(function (symbol) {
        return symbol.getName() === 'then';
    }) || target.getExportDeclarations().some(function (declaration) {
        return declaration.getModuleSpecifierValue() !== undefined;
    });
}

function thenIgnoresNamespace(target: SourceFile): boolean {
    const thenExport = target.getExportSymbols().find(function (symbol) {
        return symbol.getName() === 'then';
    });
    const thenDeclaration = (thenExport?.getAliasedSymbol() ?? thenExport)?.getValueDeclaration();
    return bindingIgnoresReceiver(thenDeclaration, bindingValueIsStable);
}

export function dynamicImportProperties(call: CallExpression, target: SourceFile): ReadonlySet<string> | undefined {
    const parent = expressionWithWrappers(call).getParent();
    if (!TypeScriptMorphNode.isAwaitExpression(parent) || hasDynamicScope(call.getSourceFile())) {
        return undefined;
    }
    if (thenIgnoresNamespace(target)) {
        return new Set([ 'then' ]);
    }
    if (namespaceMayResolveAnotherValue(target)) {
        return undefined;
    }
    const observation = createNamespaceReadObservation(localBindingReferences);
    return observation.observe(parent) ? observation.properties : undefined;
}
