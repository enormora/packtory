import { times } from 'remeda';
import type { SlotState, SpinnerSharedAccessors } from './spinner-shared-state.ts';

export type SlotSnapshot = {
    readonly state: SlotState;
    readonly label: string;
    readonly message: string;
};

export function readAllSnapshots(accessors: SpinnerSharedAccessors): readonly SlotSnapshot[] {
    return times(accessors.layout.slotCount, (slotIndex) => {
        return accessors.readSlot(slotIndex);
    });
}

export function findHighestActiveSlotIndex(snapshots: readonly SlotSnapshot[]): number {
    return snapshots.findLastIndex((snapshot) => {
        return snapshot.state !== 'empty';
    });
}
