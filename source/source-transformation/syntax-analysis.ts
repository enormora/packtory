import type { SourceFile, ts } from 'ts-morph';

export type SyntaxAnalysisResults<Value> = WeakMap<ts.SourceFile, { readonly value: Value; }>;

export function createSyntaxAnalysis<Value>(
    analyze: (source: SourceFile) => Value,
    results: SyntaxAnalysisResults<Value>
): (source: SourceFile) => Value {
    return function (source) {
        const snapshot = source.compilerNode;
        const result = results.get(snapshot) ?? { value: analyze(source) };
        results.set(snapshot, result);
        return result.value;
    };
}
