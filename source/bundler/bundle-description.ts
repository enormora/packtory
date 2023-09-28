import type { PackageJson, SetRequired } from 'type-fest';

type SourceContent = {
    readonly kind: 'source';
    readonly targetFilePath: string;
    readonly source: string;
    readonly sourceFilePath?: undefined;
};

type ReferenceContent = {
    readonly kind: 'reference';
    readonly targetFilePath: string;
    readonly sourceFilePath: string;
    readonly source?: undefined;
};

type SubstitutedContent = {
    readonly kind: 'substituted';
    readonly targetFilePath: string;
    readonly sourceFilePath: string;
    readonly source: string;
};

export type BundleContent = Readonly<ReferenceContent | SourceContent | SubstitutedContent>;

export type BundlePackageJson = Readonly<SetRequired<PackageJson, 'name' | 'version'>>;

export type BundleDescription = {
    readonly contents: readonly BundleContent[];
    readonly packageJson: BundlePackageJson;
};
