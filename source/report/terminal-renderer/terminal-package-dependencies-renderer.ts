import type {
    PackageDependency,
    PackageDependencyGroup,
    PackageDependencyInspection,
    PackageDependencyManifestState
} from '../../packtory/packtory-results.ts';
import { createColors, type Colors } from './terminal-preview-renderer-shared.ts';

type TerminalPackageDependenciesRendererOptions = {
    readonly color?: boolean | undefined;
};

type VersionedManifestState = Extract<PackageDependencyManifestState, { readonly group: PackageDependencyGroup; }>;

function isVersionedManifestState(manifest: PackageDependencyManifestState): manifest is VersionedManifestState {
    return Object.hasOwn(manifest, 'group');
}

function hasManifestGroup(manifest: PackageDependencyManifestState, group: PackageDependencyGroup): boolean {
    return isVersionedManifestState(manifest) && manifest.group === group;
}

function renderManifest(manifest: PackageDependencyManifestState): string {
    if (manifest.type === 'missing-version') {
        return 'missing version';
    }
    if (manifest.type === 'invalid-version') {
        return `${manifest.version} invalid: ${manifest.message}`;
    }
    return manifest.version;
}

function renderReference(dependency: PackageDependency): readonly string[] {
    return dependency.references.map(function (reference) {
        const specifier = reference.sourceSpecifier === reference.emittedSpecifier
            ? reference.sourceSpecifier
            : `${reference.sourceSpecifier} -> ${reference.emittedSpecifier}`;
        return `    ${reference.sourcePath}: ${specifier}`;
    });
}

function renderDependency(dependency: PackageDependency, colors: Colors): readonly string[] {
    return [
        `  ${colors.bold(dependency.name)} ${renderManifest(dependency.manifest)} (${dependency.origin})`,
        ...renderReference(dependency)
    ];
}

function dependenciesForGroup(
    dependencies: readonly PackageDependency[],
    group: PackageDependencyGroup
): readonly PackageDependency[] {
    return dependencies.filter(function (dependency) {
        return hasManifestGroup(dependency.manifest, group);
    });
}

function dependenciesWithoutGroup(dependencies: readonly PackageDependency[]): readonly PackageDependency[] {
    return dependencies.filter(function (dependency) {
        return dependency.manifest.type === 'missing-version';
    });
}

function renderGroup(
    dependencies: readonly PackageDependency[],
    group: PackageDependencyGroup,
    colors: Colors
): readonly string[] {
    const grouped = dependenciesForGroup(dependencies, group);
    if (grouped.length === 0) {
        return [];
    }
    return [
        group,
        ...grouped.flatMap(function (dependency) {
            return renderDependency(dependency, colors);
        })
    ];
}

function renderMissingGroup(dependencies: readonly PackageDependency[], colors: Colors): readonly string[] {
    const missing = dependenciesWithoutGroup(dependencies);
    if (missing.length === 0) {
        return [];
    }
    return [
        'unresolved',
        ...missing.flatMap(function (dependency) {
            return renderDependency(dependency, colors);
        })
    ];
}

export function renderTerminalPackageDependencies(
    inspection: PackageDependencyInspection,
    options: TerminalPackageDependenciesRendererOptions = {}
): string {
    const colors = createColors(options.color);
    const lines = [
        'Packtory dependency reasons [Dry run]',
        colors.bold(inspection.packageName),
        ...inspection.dependencies.length === 0 ? [ 'No dependencies.' ] : [
            ...renderGroup(inspection.dependencies, 'dependencies', colors),
            ...renderGroup(inspection.dependencies, 'peerDependencies', colors),
            ...renderMissingGroup(inspection.dependencies, colors)
        ]
    ];
    return `${lines.join('\n')}\n`;
}
