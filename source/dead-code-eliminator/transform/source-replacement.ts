import type { Node as TypeScriptMorphNode } from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';

export type SourcePart = TypeScriptMorphNode | string;

export function rewriteRetainedSource(
    node: TypeScriptMorphNode,
    parts: readonly SourcePart[],
    rewrite: (retained: TypeScriptMorphNode) => readonly SourceTextEdit[]
): readonly SourceTextEdit[] {
    let cursor = { offset: node.getStart(), content: '' };
    const edits: SourceTextEdit[] = [];
    for (const part of parts) {
        if (typeof part === 'string') {
            cursor.content += part;
        } else {
            if (part.getStart() < cursor.offset || part.getEnd() > node.getEnd()) {
                throw new Error('Retained source range lies outside replacement');
            }
            edits.push({ start: cursor.offset, end: part.getStart(), content: cursor.content }, ...rewrite(part));
            cursor = { offset: part.getEnd(), content: '' };
        }
    }
    return [ ...edits, { start: cursor.offset, end: node.getEnd(), content: cursor.content } ].filter(function (edit) {
        return edit.start !== edit.end || edit.content.length > 0;
    });
}

export function sourceReplacement(node: TypeScriptMorphNode, parts: readonly SourcePart[]): readonly SourceTextEdit[] {
    return rewriteRetainedSource(node, parts, function () {
        return [];
    });
}
