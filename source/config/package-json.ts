import type { JsonValue } from 'type-fest';

const runtimePackageJsonDependencyFieldName = {
    dependencies: 'dependencies',
    peerDependencies: 'peerDependencies'
} as const;

export const packageJsonDependencyFieldNames = [
    runtimePackageJsonDependencyFieldName.dependencies,
    'devDependencies',
    runtimePackageJsonDependencyFieldName.peerDependencies
] as const;

const forbiddenAdditionalPackageJsonAttributeNames = [
    ...packageJsonDependencyFieldNames,
    'bin',
    'exports',
    'imports',
    'main',
    'name',
    'types',
    'type',
    'version'
] as const;

const forbiddenAdditionalPackageJsonAttributeNameSet = new Set<string>(forbiddenAdditionalPackageJsonAttributeNames);

export function isForbiddenAdditionalPackageJsonAttributeName(value: string): boolean {
    return forbiddenAdditionalPackageJsonAttributeNameSet.has(value);
}

export type MainPackageJson = {
    readonly type: 'module';
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly devDependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
    readonly imports?: Readonly<Record<string, JsonValue>> | undefined;
};

export type AdditionalPackageJsonAttributes = Readonly<Record<string, JsonValue>>;
