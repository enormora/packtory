import { decorateWithPackageManifestExport } from './package-manifest-export.ts';
import {
    buildExportEntry,
    toImportTarget,
    type BundleLike,
    type ExplicitSurface,
    type ExportEntry
} from './package-shape.ts';
import { getRoot } from './root-registry.ts';

type ExplicitExportsBundle = Pick<BundleLike, 'exportPackageManifest' | 'name' | 'roots'>;

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

    const [ executableEntry ] = surface.packageInterface.executables ?? [];
    if (executableEntry === undefined) {
        return [];
    }

    const { declarationFile } = getRoot(bundle, executableEntry.root);
    if (declarationFile === undefined) {
        return [];
    }

    return [ [ '.', { types: toImportTarget(declarationFile.targetFilePath) } ] ];
}

export function buildExplicitExportsField(
    bundle: ExplicitExportsBundle,
    surface: ExplicitSurface
): Record<string, ExportEntry | string> {
    return decorateWithPackageManifestExport(bundle, Object.fromEntries(buildEntries(bundle, surface)));
}
