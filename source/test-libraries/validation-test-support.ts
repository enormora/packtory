import assert from 'node:assert';
import { Result } from 'true-myth';
import { validateConfig } from '../config/validation.ts';
import { minimalPackageConfigFactory } from './config-fixtures.ts';

export type ConfigInput = Readonly<Record<string, unknown>>;

export function withRegistry(extra: ConfigInput): ConfigInput {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: {
            sourcesFolder: 'foo',
            mainPackageJson: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        ...extra
    };
}

export type CycleDependencyKind = 'bundleDependencies' | 'bundlePeerDependencies';

export function packageWithDeps(
    name: string,
    kind: CycleDependencyKind,
    deps: readonly string[]
): ConfigInput {
    return { ...minimalPackageConfigFactory.build({ name }), [kind]: deps };
}

export function expectCyclicError(packages: readonly ConfigInput[], expectedPath: string): void {
    const result = validateConfig(withRegistry({ packages }));
    assert.deepStrictEqual(result, Result.err([ `Unexpected cyclic dependency path: [${expectedPath}]` ]));
}

export function fooPackage(name = 'foo'): ConfigInput {
    return minimalPackageConfigFactory.build({ name });
}

export const duplicateCAndMissingBPackages: readonly ConfigInput[] = [
    packageWithDeps('a', 'bundlePeerDependencies', [ 'b' ]),
    fooPackage('c'),
    fooPackage('c')
];

export const duplicateCAndMissingBErrors: readonly string[] = [
    'Duplicate package definition with the name "c"',
    'Bundle peer dependency "b" referenced in "a" does not exist'
];

export function withCustomCommon(commonExtras: ConfigInput, packages: readonly ConfigInput[]): ConfigInput {
    return {
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        commonPackageSettings: { sourcesFolder: 'foo', mainPackageJson: { type: 'module' }, ...commonExtras },
        packages
    };
}

export function withCommonWithoutPublishSettings(packages: readonly ConfigInput[]): ConfigInput {
    return withCustomCommon({}, packages);
}

export const placementErrorMessage = 'publishSettings must be set in commonPackageSettings or in every package';

export const packageSpecificPublishSettings: readonly ConfigInput[] = [
    { name: 'foo', roots: { main: { js: 'foo' } }, publishSettings: { access: 'public' } },
    { name: 'bar', roots: { main: { js: 'bar' } }, publishSettings: { access: 'restricted' } }
];

export function allowScriptsErrorFor(packageName: string): string {
    return (
        `Package "${packageName}": "scripts" in additionalPackageJsonAttributes` +
        ' requires "publishSettings.allowScripts: true"'
    );
}

export const postinstallScripts = { postinstall: 'echo hi' };
export const publicWithAllowScripts = { publishSettings: { access: 'public', allowScripts: true } };
export const commonScriptsAttribute = { additionalPackageJsonAttributes: { scripts: postinstallScripts } };
export const fooPackageWithScripts: ConfigInput = {
    name: 'foo',
    roots: { main: { js: 'foo' } },
    additionalPackageJsonAttributes: { scripts: postinstallScripts }
};
