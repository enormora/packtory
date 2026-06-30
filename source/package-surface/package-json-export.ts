import type { ExportEntry, PackageJsonExportLike } from './package-shape.ts';

function packageJsonExportPath(): './package.json' {
    return './package.json';
}

export function decorateWithPackageJsonExport<TExports extends Record<string, ExportEntry | string>>(
    bundle: PackageJsonExportLike,
    exportsField: TExports
): TExports {
    if (bundle.exportPackageJson !== true) {
        return exportsField;
    }
    return { ...exportsField, [packageJsonExportPath()]: packageJsonExportPath() };
}
