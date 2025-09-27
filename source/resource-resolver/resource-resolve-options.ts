import type { EntryPoint } from '../config/entry-point.js';
import type { AdditionalFileDescription } from '../config/additional-files.js';
import type { ModuleResolution } from '../dependency-scanner/typescript-project-analyzer.js';

export type EntryPoints = readonly [EntryPoint, ...(readonly EntryPoint[])];

export type ResourceResolveOptions = {
    readonly sourcesFolder: string;
    readonly entryPoints: EntryPoints;
    readonly name: string;
    readonly includeSourceMapFiles: boolean;
    readonly additionalFiles: readonly (AdditionalFileDescription | string)[];
    readonly moduleResolution: ModuleResolution;
};
