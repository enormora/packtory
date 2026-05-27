export function toRegistryPackagePath(packageName: string): string {
    return packageName.replace('/', '%2F');
}
