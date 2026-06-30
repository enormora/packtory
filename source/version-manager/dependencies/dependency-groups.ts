import { mergeAll } from 'remeda';

export type GroupedDependencies = {
    readonly dependencies: Readonly<Record<string, string>>;
    readonly peerDependencies: Readonly<Record<string, string>>;
};

export function mergeDependencyGroups(...groups: readonly GroupedDependencies[]): Readonly<GroupedDependencies> {
    return {
        dependencies: mergeAll(
            groups.map(function (group) {
                return group.dependencies;
            })
        ),
        peerDependencies: mergeAll(
            groups.map(function (group) {
                return group.peerDependencies;
            })
        )
    };
}
