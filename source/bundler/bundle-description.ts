import { PackageJson, SetRequired } from 'type-fest';

interface SourceContent {
    kind: 'source';
    targetFilePath: string;
    source: string;
    sourceFilePath?: undefined;
}

interface ReferenceContent {
    kind: 'reference';
    targetFilePath: string;
    sourceFilePath: string;
    source?: undefined;
}

interface SubstitutedContent {
    kind: 'substituted';
    targetFilePath: string;
    sourceFilePath: string;
    source: string;
}

export type BundleContent = SourceContent | ReferenceContent | SubstitutedContent;

export interface BundleDescription {
    readonly contents: readonly BundleContent[];
    readonly packageJson: SetRequired<PackageJson, 'name' | 'version'>;
}
