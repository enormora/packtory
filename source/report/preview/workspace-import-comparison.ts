import type { WorkspaceImport } from '../inspectors/workspace-imports.ts';

export type ComparisonRow = {
    readonly label: string;
    readonly before: string;
    readonly after: string;
};

function describeImports(imports: readonly WorkspaceImport[], packageName: string, emitted: boolean): string {
    const references = imports.filter(function (reference) {
        return reference.packageName === packageName;
    });
    const descriptions = references.map(function (reference) {
        const specifier = emitted ? reference.emittedSpecifier : reference.sourceSpecifier;
        return `${reference.sourcePath}: ${specifier}`;
    });
    const sorted = Array.from(new Set(descriptions)).toSorted(function (left, right) {
        return left.localeCompare(right);
    });
    return sorted.length === 0 ? 'no retained import' : sorted.join(', ');
}

export function compareWorkspaceImports(
    before: readonly WorkspaceImport[],
    after: readonly WorkspaceImport[]
): readonly ComparisonRow[] {
    const names = new Set([ ...before, ...after ].map(function (reference) {
        return reference.packageName;
    }));
    return Array
        .from(names)
        .toSorted(function (left, right) {
            return left.localeCompare(right);
        })
        .map(function (name) {
            return {
                label: `${name} imports`,
                before: describeImports(before, name, false),
                after: describeImports(after, name, true)
            };
        });
}
