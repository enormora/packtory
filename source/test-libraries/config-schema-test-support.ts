import { packtoryConfigSchema } from '../config/packtory-config-schema.ts';
import { checkValidationFailure, checkValidationSuccess } from './verify-schema-validation.ts';

export type ConfigShape = Readonly<Record<string, unknown>>;
export type PackageShape = Readonly<Record<string, unknown>>;

const registrySettings = { auth: { type: 'bearer-token', token: 'token' } } as const;
export const mainPackageJson = { type: 'module' } as const;
export const roots = { main: { js: 'foo' } } as const;
export const emptyNoDuplicatedFilesAllowListMessage =
    'at packages[0].checks.noDuplicatedFiles.allowList[0]: string must contain at least 1 character';

export function packageConfig(overrides: PackageShape = {}): PackageShape {
    return {
        sourcesFolder: 'source',
        mainPackageJson,
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

export function configWith(overrides: ConfigShape): ConfigShape {
    return {
        registrySettings,
        packages: [ packageConfig() ],
        ...overrides
    };
}

export function configWithEmptyNoDuplicatedFilesAllowList(): ConfigShape {
    return configWith({
        checks: { noDuplicatedFiles: { enabled: true } },
        packages: [ packageConfig({ checks: { noDuplicatedFiles: { allowList: [ '' ] } } }) ]
    });
}

export function validConfig(data: ConfigShape): ReturnType<typeof checkValidationSuccess> {
    return checkValidationSuccess({ schema: packtoryConfigSchema, data, expectedData: data });
}

export function invalidConfig(
    data: unknown,
    expectedMessages: readonly string[]
): ReturnType<typeof checkValidationFailure> {
    return checkValidationFailure({ schema: packtoryConfigSchema, data, expectedMessages });
}
