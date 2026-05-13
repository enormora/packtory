import { structuredPatch as untypedStructuredPatch } from 'diff';

type StructuredPatchHunk = {
    readonly oldStart: number;
    readonly oldLines: number;
    readonly newStart: number;
    readonly newLines: number;
    readonly lines: readonly string[];
};

type StructuredPatchResult = {
    readonly hunks: readonly StructuredPatchHunk[];
};

type StructuredPatchOptions = {
    readonly context?: number;
};

type StructuredPatchArgs = readonly [
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: StructuredPatchOptions
];

type StructuredPatchFunction = (...args: StructuredPatchArgs) => StructuredPatchResult;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the diff package is untyped here, so we constrain it once behind a typed adapter */
const structuredPatch = untypedStructuredPatch as StructuredPatchFunction;

export function createStructuredPatch(...args: StructuredPatchArgs): StructuredPatchResult {
    return structuredPatch(...args);
}
