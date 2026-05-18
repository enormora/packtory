import { createFactory } from '@enormora/objectory';

type RootShape = { readonly js: string; readonly declarationFile?: string | undefined };

const rootFactory = createFactory<RootShape>(() => {
    return { js: '' };
});

const minimalRootFactory = createFactory<RootShape>(() => {
    return { js: 'foo' };
});

type MainPackageJsonShape = { readonly type: 'module' };

const mainPackageJsonFactory = createFactory<MainPackageJsonShape>(() => {
    return { type: 'module' };
});

const rootsFactory = createFactory<Readonly<Record<string, RootShape>>>(() => {
    return { main: rootFactory };
});

const minimalRootsFactory = createFactory<Readonly<Record<string, RootShape>>>(() => {
    return { main: minimalRootFactory };
});

type FooPackageConfigShape = {
    readonly name: string;
    readonly sourcesFolder: string;
    readonly roots: Readonly<Record<string, RootShape>>;
    readonly mainPackageJson: MainPackageJsonShape;
    readonly defaultModuleRoot?: string | undefined;
};

export const fooPackageConfigFactory = createFactory<FooPackageConfigShape>(() => {
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

export const minimalPackageConfigFactory = createFactory<MinimalPackageConfigShape>(() => {
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

const validationRootFactory = createFactory<RootShape>(() => {
    return { js: 'index.js' };
});

const validationRootsFactory = createFactory<Readonly<Record<string, RootShape>>>(() => {
    return { main: validationRootFactory };
});

export const validationPackageConfigFactory = createFactory<ValidationPackageConfigShape>(() => {
    return {
        name: 'pkg-a',
        roots: validationRootsFactory,
        sourcesFolder: 'src'
    };
});
