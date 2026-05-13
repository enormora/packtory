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

type DiffModule = {
    readonly structuredPatch: StructuredPatchFunction;
};

const require = createRequire(import.meta.url);
/* eslint-disable-next-line import/no-commonjs, @typescript-eslint/no-unsafe-assignment -- the diff package ships untyped ESM, so this adapter constrains it once at the boundary */
const untypedDiffModule = require('diff');
/* eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the local DiffModule type constrains the single imported surface we rely on */
const diffModule = untypedDiffModule as DiffModule;

export function createStructuredPatch(...args: StructuredPatchArgs): StructuredPatchResult {
    return diffModule.structuredPatch(...args);
}
