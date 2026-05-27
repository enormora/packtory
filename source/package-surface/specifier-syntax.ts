const exportKeyPrefixLength = 2;

export function toPackageSpecifier(packageName: string, exportKey: string): string {
    return exportKey === '.' ? packageName : `${packageName}/${exportKey.slice(exportKeyPrefixLength)}`;
}
