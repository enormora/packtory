import { createRequire } from 'node:module';

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

const require = createRequire(import.meta.url);
const { structuredPatch } = require('diff') as {
    readonly structuredPatch: StructuredPatchFunction;
};

export function createStructuredPatch(...args: StructuredPatchArgs): StructuredPatchResult {
    return structuredPatch(...args);
}
