const requestFieldNames = {
    repository: 'repo',
    reference: 'ref',
    hash: 'sha',
    baseAddress: 'baseUrl',
    expectedHeadObjectIdentifier: 'expectedHeadOid'
} as const;

type FieldName<Key> = Key extends keyof typeof requestFieldNames ? (typeof requestFieldNames)[Key] : Key;

type GitHubRequest<Input> = {
    readonly [Key in keyof Input as FieldName<Key>]: Input[Key] extends readonly (infer Element)[] ? Element[]
        : Input[Key];
};

function isRequestFieldName(key: string): key is keyof typeof requestFieldNames {
    return Object.hasOwn(requestFieldNames, key);
}

export function toGitHubRequest<const Input extends Record<string, unknown>>(input: Input): GitHubRequest<Input>;
export function toGitHubRequest(input: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(input).map(function ([ key, value ]): readonly [string, unknown] {
            return [
                isRequestFieldName(key) ? requestFieldNames[key] : key,
                Array.isArray(value) ? Array.from(value) : value
            ];
        })
    );
}
