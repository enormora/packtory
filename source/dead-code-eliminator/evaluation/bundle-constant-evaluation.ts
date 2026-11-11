import type { SourceFile } from 'ts-morph';
import { resolveImportedExpressionPropertyPath } from '../imported-expression-origin.ts';
import type { RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { evaluateImportedConstant } from './imported-constant.ts';
import type { PrimitiveEvaluator } from './constant-evaluation.ts';
import type { ModuleConstantSnapshot } from './module-constant-snapshot.ts';
import type { ModuleValue } from './module-export-value.ts';
import type { EvaluatedValue } from './primitive-value.ts';

type BundleConstantSnapshot = Pick<ModuleConstantSnapshot, 'resolveModule'> & {
    readonly modules: Pick<ModuleConstantSnapshot['modules'], 'get' | 'has'>;
};

function namespaceMember(
    value: ModuleValue | undefined,
    name: string | { readonly type: 'call-result'; },
    snapshot: BundleConstantSnapshot
): ModuleValue | undefined {
    const exports: ReadonlyMap<unknown, ModuleValue> | undefined = value?.kind === 'namespace'
        ? snapshot.modules.get(value.source)?.exports
        : undefined;
    return exports?.get(name);
}

function projectedValue(
    source: SourceFile,
    path: readonly (string | { readonly type: 'call-result'; })[],
    snapshot: BundleConstantSnapshot
): EvaluatedValue | undefined {
    const value = path.reduce<ModuleValue | undefined>(function (current, name) {
        return namespaceMember(current, name, snapshot);
    }, { kind: 'namespace', source });
    return value?.kind === 'constant' ? value.value : undefined;
}

export function createBundleConstantEvaluator(
    snapshot: BundleConstantSnapshot,
    resolveExternal: RuntimeModuleResolver
): PrimitiveEvaluator {
    return function (expression) {
        const origin = resolveImportedExpressionPropertyPath(expression);
        if (origin === undefined) {
            return undefined;
        }
        const source = snapshot.resolveModule(origin.from, expression.getSourceFile());
        if (source === undefined || !snapshot.modules.has(source)) {
            return evaluateImportedConstant(expression, resolveExternal);
        }
        return snapshot.modules.get(expression.getSourceFile())?.initialized === true
            ? projectedValue(source, origin.path, snapshot)
            : undefined;
    };
}
