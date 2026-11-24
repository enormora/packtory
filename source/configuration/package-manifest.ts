import type { JsonValue as JavaScriptObjectNotationValue } from 'type-fest';

const packageManifestDependencyFieldNames = [ 'dependencies', 'devDependencies', 'peerDependencies' ] as const;

const forbiddenAdditionalPackageManifestAttributeNames = [
    ...packageManifestDependencyFieldNames,
    'bin',
    'exports',
    'imports',
    'main',
    'name',
    'types',
    'type',
    'version'
] as const;

const forbiddenAdditionalPackageManifestAttributeNameSet = new Set<string>(
    forbiddenAdditionalPackageManifestAttributeNames
);

export function isForbiddenAdditionalPackageManifestAttributeName(value: string): boolean {
    return forbiddenAdditionalPackageManifestAttributeNameSet.has(value);
}

export type MainPackageManifest = {
    readonly type: 'module';
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly devDependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
    readonly imports?: Readonly<Record<string, JavaScriptObjectNotationValue>> | undefined;
};

export type AdditionalPackageManifestAttributes = Readonly<Record<string, JavaScriptObjectNotationValue>>;
