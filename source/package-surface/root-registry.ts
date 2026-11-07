import { rootFiles } from '../common/package-root.ts';
import type { BundleLike, ExplicitSurface, RootFileDescription } from './package-shape.ts';

export function getRoot(bundle: Pick<BundleLike, 'name' | 'roots'>, rootIdentifier: string): RootFileDescription {
    const root = bundle.roots[rootIdentifier];
    if (root === undefined) {
        throw new Error(`Package "${bundle.name}" references unknown root "${rootIdentifier}"`);
    }
    return root;
}

function collectExplicitPublicRootIdentifiers(surface: ExplicitSurface): ReadonlySet<string> {
    const publicRootIdentifiers = new Set<string>();
    const moduleEntries = surface.packageInterface.modules ?? [];
    const executableEntries = surface.packageInterface.executables ?? [];
    for (const entry of moduleEntries) {
        publicRootIdentifiers.add(entry.root);
    }
    for (const entry of executableEntries) {
        publicRootIdentifiers.add(entry.root);
    }

    return publicRootIdentifiers;
}

export function getEntryRootIdentifiers(bundle: Pick<BundleLike, 'roots' | 'surface'>): ReadonlySet<string> {
    if (bundle.surface.mode === 'files') {
        return new Set();
    }
    if (bundle.surface.mode === 'implicit') {
        return new Set(Object.keys(bundle.roots));
    }

    const publicRootIdentifiers = collectExplicitPublicRootIdentifiers(bundle.surface);
    return new Set([ ...publicRootIdentifiers, ...bundle.surface.packageInterface.privateRoots ?? [] ]);
}

export function getEntryRootTargetFilePaths(bundle: Pick<BundleLike, 'name' | 'roots' | 'surface'>): readonly string[] {
    return Array.from(getEntryRootIdentifiers(bundle)).flatMap(function (identifier) {
        const root = bundle.roots[identifier];
        if (root === undefined) {
            throw new Error(`Bundle "${bundle.name}" is missing root "${identifier}" referenced by its entry surface`);
        }
        return rootFiles(root).map(function (file) {
            return file.targetFilePath;
        });
    });
}
