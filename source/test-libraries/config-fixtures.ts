import { createFactory } from '@enormora/objectory';
import type {
    PackageConfig,
    PackageConfigsByName,
    PacktoryConfig,
    PacktoryConfigWithoutRegistry
} from '../config/config.ts';
import { buildPackageGraph } from '../config/package-graph-builder.ts';
import type { PublishSettings } from '../config/publish-settings.ts';
import type { ConfigWithGraph, ValidConfigResult, ValidConfigWithoutRegistryResult } from '../config/validation.ts';

type RootShape = { readonly js: string; readonly declarationFile?: string | undefined; };

const rootFactory = createFactory<RootShape>(function () {
    return { js: '' };
});

const minimalRootFactory = createFactory<RootShape>(function () {
    return { js: 'foo' };
});

type MainPackageJsonShape = { readonly type: 'module'; };

const mainPackageJsonFactory = createFactory<MainPackageJsonShape>(function () {
    return { type: 'module' };
});

const rootsFactory = createFactory<Readonly<Record<string, RootShape>>>(function () {
    return { main: rootFactory };
});

const minimalRootsFactory = createFactory<Readonly<Record<string, RootShape>>>(function () {
    return { main: minimalRootFactory };
});

export type FooPackageConfigShape = {
    readonly name: string;
    readonly sourcesFolder: string;
    readonly roots: Readonly<Record<string, RootShape>>;
    readonly mainPackageJson: MainPackageJsonShape;
    readonly defaultModuleRoot?: string | undefined;
};

export const fooPackageConfigFactory = createFactory<FooPackageConfigShape>(function () {
    return {
        name: 'foo',
        sourcesFolder: 'the-source',
        roots: rootsFactory,
        mainPackageJson: mainPackageJsonFactory
    };
});

type MinimalPackageConfigShape = {
    readonly name: string;
    readonly roots: Readonly<Record<string, RootShape>>;
};

export const minimalPackageConfigFactory = createFactory<MinimalPackageConfigShape>(function () {
    return {
        name: 'foo',
        roots: minimalRootsFactory
    };
});

type ValidationPackageConfigShape = {
    readonly name: string;
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
    readonly roots: Readonly<Record<string, RootShape>>;
    readonly sourcesFolder: string;
};

const validationRootFactory = createFactory<RootShape>(function () {
    return { js: 'index.js' };
});

const validationRootsFactory = createFactory<Readonly<Record<string, RootShape>>>(function () {
    return { main: validationRootFactory };
});

export const validationPackageConfigFactory = createFactory<ValidationPackageConfigShape>(function () {
    return {
        name: 'pkg-a',
        roots: validationRootsFactory,
        sourcesFolder: 'src'
    };
});

export const publicPublishSettings: PublishSettings = { access: 'public' };
export const publicPublishSettingsAllowingScripts: PublishSettings = { access: 'public', allowScripts: true };

export function packageConfigFixture(overrides: Partial<PackageConfig> = {}): PackageConfig {
    return {
        name: 'pkg-a',
        roots: { main: { js: 'index.js' } },
        sourcesFolder: 'src',
        mainPackageJson: { type: 'module' },
        ...overrides
    };
}

export function packageConfigsByNameFixture(packages: readonly PackageConfig[]): PackageConfigsByName {
    const packageConfigs: Record<string, PackageConfig> = {};
    for (const packageConfig of packages) {
        packageConfigs[packageConfig.name] = packageConfig;
    }
    return packageConfigs;
}

function configWithGraph<TConfig extends PacktoryConfigWithoutRegistry>(
    packtoryConfig: TConfig
): ConfigWithGraph<TConfig> {
    const packageConfigs = packageConfigsByNameFixture(packtoryConfig.packages);
    return {
        packtoryConfig,
        packageConfigs,
        packageGraph: buildPackageGraph(packageConfigs)
    };
}

export function validConfigWithoutRegistryFixture(
    overrides: Partial<PacktoryConfigWithoutRegistry> = {}
): ValidConfigWithoutRegistryResult {
    return configWithGraph({
        packages: [],
        ...overrides
    });
}

export function validConfigFixture(overrides: Partial<PacktoryConfig> = {}): ValidConfigResult {
    return configWithGraph({
        registrySettings: { auth: { type: 'bearer-token', token: 'token' } },
        packages: [],
        ...overrides
    });
}
