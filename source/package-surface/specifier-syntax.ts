const exportKeyPrefixLength = 2;

export type ImplicitSpecifierResolution = readonly ['content', string] | readonly ['private'] | readonly ['root'];

export function toPackageSpecifier(packageName: string, exportKey: string): string {
    return exportKey === '.' ? packageName : `${packageName}/${exportKey.slice(exportKeyPrefixLength)}`;
}

export function resolveExplicitExportKey(packageName: string, specifier: string): string | undefined {
    if (specifier === packageName) {
        return '.';
    }
    if (specifier.startsWith(`${packageName}/`)) {
        return `./${specifier.slice(packageName.length + 1)}`;
    }
    return undefined;
}

export function resolveImplicitSpecifier(bundleName: string, specifier: string): ImplicitSpecifierResolution {
    if (specifier === bundleName) {
        return ['root'];
    }

    const prefix = `${bundleName}/`;
    if (!specifier.startsWith(prefix)) {
        return ['private'];
    }

    return ['content', specifier.slice(prefix.length)];
}
