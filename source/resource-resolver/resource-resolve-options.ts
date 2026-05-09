import type { EntryPoint } from '../config/entry-point.ts';
import type { AdditionalFileDescription } from '../config/additional-files.ts';

type EntryPoints = readonly [EntryPoint, ...(readonly EntryPoint[])];

export type ResourceResolveOptions = {
    readonly sourcesFolder: string;
    readonly entryPoints: EntryPoints;
    readonly name: string;
    readonly includeSourceMapFiles: boolean;
    readonly additionalFiles: readonly (AdditionalFileDescription | string)[];
};
