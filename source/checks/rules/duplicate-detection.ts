import { formatPathLevelMessage, formatSharedDeclarationsMessage } from './duplicate-messages.ts';
import type { OwnerInfo } from './file-ownership.ts';

export type MultipleOwners = readonly [OwnerInfo, OwnerInfo, ...(readonly OwnerInfo[])];

const minimumOwnerCountForDuplicate = 2;

export function hasMultipleOwners(owners: readonly OwnerInfo[]): owners is MultipleOwners {
    return owners.length >= minimumOwnerCountForDuplicate;
}

export function duplicateMessage(filePath: string, owners: MultipleOwners): string | undefined {
    const allOwnersHaveNoBindings = owners.every((owner) => {
        return owner.survivingBindings.size === 0;
    });
    if (allOwnersHaveNoBindings) {
        return formatPathLevelMessage(filePath, owners);
    }
    const [firstOwner, ...remainingOwners] = owners;
    const sharedDeclarations = remainingOwners.reduce<Set<string>>((declarations, owner) => {
        return new Set(
            Array.from(declarations).filter((declaration) => {
                return owner.survivingBindings.has(declaration);
            })
        );
    }, new Set(firstOwner.survivingBindings));
    if (sharedDeclarations.size === 0) {
        return undefined;
    }
    return formatSharedDeclarationsMessage(filePath, sharedDeclarations, owners);
}
