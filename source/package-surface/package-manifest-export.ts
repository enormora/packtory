import type { ExportEntry, PackageManifestExportLike } from './package-shape.ts';

function packageManifestExportPath(): './package.json' {
    return './package.json';
}

export function decorateWithPackageManifestExport<TExports extends Record<string, ExportEntry | string>>(
    bundle: PackageManifestExportLike,
    exportsField: TExports
): TExports {
    if (bundle.exportPackageManifest !== true) {
        return exportsField;
    }
    return { ...exportsField, [packageManifestExportPath()]: packageManifestExportPath() };
}
