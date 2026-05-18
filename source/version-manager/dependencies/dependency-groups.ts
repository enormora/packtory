import { mergeAll } from 'remeda';

export type GroupedDependencies = {
    readonly dependencies: Record<string, string>;
    readonly peerDependencies: Record<string, string>;
};

export function mergeDependencyGroups(...groups: Readonly<GroupedDependencies>[]): Readonly<GroupedDependencies> {
    return {
        dependencies: mergeAll(
            groups.map((group) => {
                return group.dependencies;
            })
        ),
        peerDependencies: mergeAll(
            groups.map((group) => {
                return group.peerDependencies;
            })
        )
    };
}
