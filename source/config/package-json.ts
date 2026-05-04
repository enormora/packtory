import type { JsonValue } from 'type-fest';

export const packageJsonDependencyFieldNames = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

const forbiddenAdditionalPackageJsonAttributeNames = [
    ...packageJsonDependencyFieldNames,
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
    readonly type?: 'module' | undefined;
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly devDependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
};

export type AdditionalPackageJsonAttributes = Readonly<Record<string, JsonValue>>;
