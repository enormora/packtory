import { rootEntryFile, type PackageRoot } from '../common/package-root.ts';

const exportKeyPrefixLength = 2;

export function toPackageSpecifier(packageName: string, exportKey: string): string {
    return exportKey === '.' ? packageName : `${packageName}/${exportKey.slice(exportKeyPrefixLength)}`;
}

export function toRootPackageSpecifier(
    packageName: string,
    root: PackageRoot<{ readonly targetFilePath: string; }>
): string {
    return toPackageSpecifier(packageName, `./${rootEntryFile(root).targetFilePath}`);
}
