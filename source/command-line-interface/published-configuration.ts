import { isPlainObject } from 'remeda';

const fieldNames = {
    registryUrl: 'registryAddress',
    auth: 'authentication',
    js: 'javaScript',
    mainPackageJson: 'mainPackageManifest',
    additionalPackageJsonAttributes: 'additionalPackageManifestAttributes',
    exportPackageJson: 'exportPackageManifest',
    maxBundleSize: 'maximumBundleSize',
    noDevDependencyImports: 'noDevelopmentDependencyImports',
    sbom: 'softwareBillOfMaterials',
    bins: 'executables',
    prLog: 'pullRequestLog',
    explicitBaseRef: 'explicitBaseReference',
    githubActionsCi: 'githubActionsContinuousIntegration',
    idTokenEnvVar: 'identityTokenEnvironmentVariable'
} as const;

const strategyNames: ReadonlyMap<unknown, string> = new Map([
    [ 'auto', 'automatic' ],
    [ 'env', 'environment' ],
    [ 'npm-oidc', 'npm-open-identity-connect' ],
    [ 'inherit-publish-auth', 'inherit-publish-authentication' ]
]);

function isPublishedField(key: string): key is keyof typeof fieldNames {
    return Object.hasOwn(fieldNames, key);
}

export function normalizePublishedConfiguration(value: unknown): unknown {
    function normalizeStrategy(fieldValue: unknown): unknown {
        return strategyNames.get(fieldValue) ?? normalizePublishedConfiguration(fieldValue);
    }

    function normalizeNamedEntries(fieldValue: unknown): unknown {
        if (!isPlainObject(fieldValue)) {
            return normalizePublishedConfiguration(fieldValue);
        }
        return Object.fromEntries(
            Object.entries(fieldValue).map(function ([ name, entry ]) {
                return [ name, normalizePublishedConfiguration(entry) ];
            })
        );
    }

    function normalizeField(key: string, fieldValue: unknown): unknown {
        if ([ 'mainPackageManifest', 'additionalPackageManifestAttributes' ].includes(key)) {
            return fieldValue;
        }
        if ([ 'roots', 'paths' ].includes(key)) {
            return normalizeNamedEntries(fieldValue);
        }
        if ([ 'type', 'provider', 'metadata' ].includes(key)) {
            return normalizeStrategy(fieldValue);
        }
        return normalizePublishedConfiguration(fieldValue);
    }

    if (Array.isArray(value)) {
        return value.map(normalizePublishedConfiguration);
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(function ([ key, field ]) {
            const fieldName = isPublishedField(key) ? fieldNames[key] : key;
            return [ fieldName, normalizeField(fieldName, field) ];
        })
    );
}
