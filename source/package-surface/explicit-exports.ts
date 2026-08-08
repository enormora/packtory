import { decorateWithPackageJsonExport } from './package-json-export.ts';
import {
    buildExportEntry,
    toImportTarget,
    type BundleLike,
    type ExplicitSurface,
    type ExportEntry
} from './package-shape.ts';
import { getRoot } from './root-registry.ts';

type ExplicitExportsBundle = Pick<BundleLike, 'exportPackageJson' | 'name' | 'roots'>;

function buildExplicitExportEntry(
    bundle: ExplicitExportsBundle,
    entry: NonNullable<ExplicitSurface['packageInterface']['modules']>[number]
): readonly [string, ExportEntry] {
    return [ entry.export, buildExportEntry(getRoot(bundle, entry.root)) ];
}

function buildEntries(
    bundle: ExplicitExportsBundle,
    surface: ExplicitSurface
): readonly (readonly [string, ExportEntry])[] {
    const moduleEntries = surface.packageInterface.modules;
    if (moduleEntries !== undefined) {
        return moduleEntries.map(function (entry) {
            return buildExplicitExportEntry(bundle, entry);
        });
    }

    const [ binEntry ] = surface.packageInterface.bins ?? [];
    if (binEntry === undefined) {
        return [];
    }

    const { declarationFile } = getRoot(bundle, binEntry.root);
    if (declarationFile === undefined) {
        return [];
    }

    return [ [ '.', { types: toImportTarget(declarationFile.targetFilePath) } ] ];
}

export function buildExplicitExportsField(
    bundle: ExplicitExportsBundle,
    surface: ExplicitSurface
): Record<string, ExportEntry | string> {
    return decorateWithPackageJsonExport(bundle, Object.fromEntries(buildEntries(bundle, surface)));
}
