import type { OwnerInfo } from './file-ownership.ts';

function ownerNames(owners: readonly OwnerInfo[]): readonly string[] {
    return owners
        .map((owner) => {
            return owner.bundleName;
        })
        .toSorted((left, right) => {
            return left.localeCompare(right);
        });
}

export function formatSharedDeclarationsMessage(
    filePath: string,
    sharedDeclarations: ReadonlySet<string>,
    owners: readonly OwnerInfo[]
): string {
    const ownersList = ownerNames(owners).join(', ');
    const sortedDeclarations = Array.from(sharedDeclarations).toSorted((left, right) => {
        return left.localeCompare(right);
    });
    const lines = [
        `File "${filePath}" has shared declarations across multiple packages:`,
        ...sortedDeclarations.map((declaration) => {
            return `  - "${declaration}" → ${ownersList}`;
        })
    ];
    return lines.join('\n');
}

export function formatPathLevelMessage(filePath: string, owners: readonly OwnerInfo[]): string {
    return `File "${filePath}" is included in multiple packages: ${ownerNames(owners).join(', ')}`;
}
