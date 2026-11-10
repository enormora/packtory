import type { Node as TypeScriptMorphNode, ReferenceEntry } from 'ts-morph';

export function referenceTarget(reference: ReferenceEntry): TypeScriptMorphNode | undefined {
    const span = reference.getTextSpan();
    return reference.getSourceFile().getDescendantAtStartWithWidth(span.getStart(), span.getLength());
}
