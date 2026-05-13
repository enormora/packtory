import { structuredPatch, type StructuredPatch, type StructuredPatchOptionsNonabortable } from 'diff';

type StructuredPatchArgs = readonly [
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: StructuredPatchOptionsNonabortable
];

export function createStructuredPatch(...args: StructuredPatchArgs): StructuredPatch {
    return structuredPatch(...args);
}
