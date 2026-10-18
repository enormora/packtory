const responseFieldNames = {
    identifier: 'id',
    reference: 'ref',
    hash: 'sha',
    address: 'url',
    objectIdentifier: 'oid',
    databaseIdentifier: 'databaseId',
    merge_commit_hash: 'merge_commit_sha',
    commit_hash: 'commit_sha'
} as const;

function isResponseFieldName(key: string): key is keyof typeof responseFieldNames {
    return Object.hasOwn(responseFieldNames, key);
}

function responseFieldName(key: string, parentField: string): string {
    if (key === 'repository' && (parentField === 'head' || parentField === 'base')) {
        return 'repo';
    }
    return isResponseFieldName(key) ? responseFieldNames[key] : key;
}

function toProviderResponse(value: unknown, parentField: string): unknown {
    if (Array.isArray(value)) {
        return value.map(function (entry) {
            return toProviderResponse(entry, parentField);
        });
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(function ([ key, field ]) {
            return [ responseFieldName(key, parentField), toProviderResponse(field, key) ];
        })
    );
}

export function toGitHubResponse(value: unknown): unknown {
    return toProviderResponse(value, '');
}
