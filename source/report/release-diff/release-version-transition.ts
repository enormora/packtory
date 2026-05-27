export type ReleaseVersionFields = {
    readonly previousVersion: string | undefined;
    readonly chosenVersion: string | undefined;
};

function unpublishedLabel(): string {
    return '(unpublished)';
}

export function buildReleaseVersionTransition(fields: ReleaseVersionFields): string {
    if (fields.chosenVersion === undefined) {
        return unpublishedLabel();
    }
    if (fields.previousVersion === undefined) {
        return `${unpublishedLabel()} -> ${fields.chosenVersion}`;
    }
    return `${fields.previousVersion} -> ${fields.chosenVersion}`;
}

export function buildReleaseVersionLabel(fields: Pick<ReleaseVersionFields, 'previousVersion'>): string {
    if (fields.previousVersion === undefined) {
        return unpublishedLabel();
    }
    return fields.previousVersion;
}
