import type { SourceFile, ts } from 'ts-morph';

export function createSyntaxAnalysis<Value>(analyze: (source: SourceFile) => Value): (source: SourceFile) => Value {
    const results = new WeakMap<ts.SourceFile, { readonly value: Value; }>();
    return function (source) {
        const snapshot = source.compilerNode;
        const result = results.get(snapshot) ?? { value: analyze(source) };
        results.set(snapshot, result);
        return result.value;
    };
}
