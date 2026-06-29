import { createFactory } from '@enormora/objectory';

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
