import assert from 'node:assert';
import { Result } from 'true-myth';
import { validateConfiguration } from '../configuration/validation.ts';
import { minimalPackageConfigurationFactory } from './configuration-fixtures.ts';

export type ConfigurationInput = Readonly<Record<string, unknown>>;

export function withRegistry(extra: ConfigurationInput): ConfigurationInput {
    return {
        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: {
            sourcesFolder: 'foo',
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        ...extra
    };
}

export type CycleDependencyKind = 'bundleDependencies' | 'bundlePeerDependencies';

export function packageWithDependencies(
    name: string,
    kind: CycleDependencyKind,
    dependencies: readonly string[]
): ConfigurationInput {
    return { ...minimalPackageConfigurationFactory.build({ name }), [kind]: dependencies };
}

export function expectCyclicError(packages: readonly ConfigurationInput[], expectedPath: string): void {
    const result = validateConfiguration(withRegistry({ packages }));
    assert.deepStrictEqual(result, Result.err([ `Unexpected cyclic dependency path: [${expectedPath}]` ]));
}

export function fooPackage(name = 'foo'): ConfigurationInput {
    return minimalPackageConfigurationFactory.build({ name });
}

export const duplicateCAndMissingBPackages: readonly ConfigurationInput[] = [
    packageWithDependencies('a', 'bundlePeerDependencies', [ 'b' ]),
    fooPackage('c'),
    fooPackage('c')
];

export const duplicateCAndMissingBErrors: readonly string[] = [
    'Duplicate package definition with the name "c"',
    'Bundle peer dependency "b" referenced in "a" does not exist'
];

export function withCustomCommon(
    commonExtras: ConfigurationInput,
    packages: readonly ConfigurationInput[]
): ConfigurationInput {
    return {
        registrySettings: { authentication: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageManifest: { type: 'module' }, ...commonExtras },
        packages
    };
}

export function withCommonWithoutPublishSettings(packages: readonly ConfigurationInput[]): ConfigurationInput {
    return withCustomCommon({}, packages);
}

export const placementErrorMessage = 'publishSettings must be set in commonPackageSettings or in every package';

export const packageSpecificPublishSettings: readonly ConfigurationInput[] = [
    { name: 'foo', roots: { main: { javaScript: 'foo' } }, publishSettings: { access: 'public' } },
    { name: 'bar', roots: { main: { javaScript: 'bar' } }, publishSettings: { access: 'restricted' } }
];

export function allowScriptsErrorFor(packageName: string): string {
    return (
        `Package "${packageName}": "scripts" in additionalPackageManifestAttributes` +
        ' requires "publishSettings.allowScripts: true"'
    );
}

export const postinstallScripts = { postinstall: 'echo hi' };
export const publicWithAllowScripts = { publishSettings: { access: 'public', allowScripts: true } };
export const commonScriptsAttribute = { additionalPackageManifestAttributes: { scripts: postinstallScripts } };
export const fooPackageWithScripts: ConfigurationInput = {
    name: 'foo',
    roots: { main: { javaScript: 'foo' } },
    additionalPackageManifestAttributes: { scripts: postinstallScripts }
};
