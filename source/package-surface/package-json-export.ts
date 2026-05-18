import type { ExportEntry, PackageJsonExportLike } from './package-shape.ts';

const packageJsonExportKey = './package.json';
const packageJsonExportTarget = './package.json';

export function decorateWithPackageJsonExport<TExports extends Record<string, ExportEntry | string>>(
    bundle: PackageJsonExportLike,
    exportsField: TExports
): TExports {
    if (bundle.exportPackageJson !== true) {
        return exportsField;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- spread preserves the generic record shape
    return { ...exportsField, [packageJsonExportKey]: packageJsonExportTarget } as TExports;
}
