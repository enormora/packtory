import type { EntryPoint } from '../config/entry-point.ts';
import type { AdditionalFileDescription } from '../config/additional-files.ts';
import type { ModuleResolution } from '../dependency-scanner/typescript-project-analyzer.ts';

export type EntryPoints = readonly [EntryPoint, ...(readonly EntryPoint[])];

export type ResourceResolveOptions = {
    readonly sourcesFolder: string;
    readonly entryPoints: EntryPoints;
    readonly name: string;
    readonly includeSourceMapFiles: boolean;
    readonly additionalFiles: readonly (AdditionalFileDescription | string)[];
    readonly moduleResolution: ModuleResolution;
};
