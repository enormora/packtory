import { packtoryConfigurationSchema } from '../configuration/packtory-configuration-schema.ts';
import { checkValidationFailure, checkValidationSuccess } from './verify-schema-validation.ts';

export type ConfigurationShape = Readonly<Record<string, unknown>>;
export type PackageShape = Readonly<Record<string, unknown>>;

const registrySettings = { authentication: { type: 'bearer-token', token: 'token' } } as const;
export const mainPackageManifest = { type: 'module' } as const;
export const roots = { main: { javaScript: 'foo' } } as const;
export const emptyNoDuplicatedFilesAllowListMessage =
    'at packages[0].checks.noDuplicatedFiles.allowList[0]: string must contain at least 1 character';

export function packageConfiguration(overrides: PackageShape = {}): PackageShape {
    return {
        sourcesFolder: 'source',
        mainPackageManifest,
        name: 'foo',
        roots,
        ...overrides
    };
}

export function packageWithoutCommonSettings(overrides: PackageShape = {}): PackageShape {
    return {
        name: 'foo',
        roots,
        ...overrides
    };
}

export function configurationWith(overrides: ConfigurationShape): ConfigurationShape {
    return {
        registrySettings,
        packages: [ packageConfiguration() ],
        ...overrides
    };
}

export function configurationWithEmptyNoDuplicatedFilesAllowList(): ConfigurationShape {
    return configurationWith({
        checks: { noDuplicatedFiles: { enabled: true } },
        packages: [ packageConfiguration({ checks: { noDuplicatedFiles: { allowList: [ '' ] } } }) ]
    });
}

export function validConfiguration(data: ConfigurationShape): ReturnType<typeof checkValidationSuccess> {
    return checkValidationSuccess({ schema: packtoryConfigurationSchema, data, expectedData: data });
}

export function invalidConfiguration(
    data: unknown,
    expectedMessages: readonly string[]
): ReturnType<typeof checkValidationFailure> {
    return checkValidationFailure({ schema: packtoryConfigurationSchema, data, expectedMessages });
}
