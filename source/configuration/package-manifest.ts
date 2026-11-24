import type { JsonValue as JavaScriptObjectNotationValue } from 'type-fest';

const forbiddenAdditionalPackageManifestAttributeNames = new Set<string>([
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'bin',
    'exports',
    'imports',
    'main',
    'name',
    'types',
    'type',
    'version'
]);

export function isForbiddenAdditionalPackageManifestAttributeName(value: string): boolean {
    return forbiddenAdditionalPackageManifestAttributeNames.has(value);
}

export type MainPackageManifest = {
    readonly type: 'module';
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly devDependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
    readonly imports?: Readonly<Record<string, JavaScriptObjectNotationValue>> | undefined;
};

export type AdditionalPackageManifestAttributes = Readonly<Record<string, JavaScriptObjectNotationValue>>;
