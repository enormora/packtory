export type Worklist<T> = {
    readonly schedule: (item: T) => void;
    readonly scheduleAll: (items: Iterable<T>) => void;
    readonly takeNext: () => T | undefined;
};

export function createWorklist<T>(initialItems: Iterable<T>): Worklist<T> {
    const items = Array.from(initialItems);
    let nextIndex = 0;

    return {
        schedule(item) {
            items.push(item);
        },
        scheduleAll(additions) {
            for (const item of additions) {
                items.push(item);
            }
        },
        takeNext() {
            if (nextIndex >= items.length) {
                return undefined;
            }
            const nextItem = items[nextIndex];
            nextIndex += 1;
            return nextItem;
        }
    };
}
