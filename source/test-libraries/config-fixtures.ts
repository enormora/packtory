import { createFactory } from '@enormora/objectory';

type EntryPointShape = { readonly js: string; readonly declarationFile?: string | undefined };

const entryPointFactory = createFactory<EntryPointShape>(() => {
    return { js: '' };
});

const minimalEntryPointFactory = createFactory<EntryPointShape>(() => {
    return { js: 'foo' };
});

type MainPackageJsonShape = { readonly type?: 'module' | undefined };

const mainPackageJsonFactory = createFactory<MainPackageJsonShape>(() => {
    return {};
});

type FooPackageConfigShape = {
    readonly name: string;
    readonly sourcesFolder: string;
    readonly entryPoints: readonly EntryPointShape[];
    readonly mainPackageJson: MainPackageJsonShape;
};

export const fooPackageConfigFactory = createFactory<FooPackageConfigShape>(() => {
    return {
        name: 'foo',
        sourcesFolder: 'the-source',
        entryPoints: entryPointFactory.asArray({ length: 1 }),
        mainPackageJson: mainPackageJsonFactory
    };
});

type MinimalPackageConfigShape = {
    readonly name: string;
    readonly entryPoints: readonly EntryPointShape[];
};

export const minimalPackageConfigFactory = createFactory<MinimalPackageConfigShape>(() => {
    return {
        name: 'foo',
        entryPoints: minimalEntryPointFactory.asArray({ length: 1 })
    };
});
