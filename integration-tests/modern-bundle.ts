import { serializePackageJson } from '../source/version-manager/manifest/serialize.ts';

type TransferableFile = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};

type ManifestFile = {
    readonly filePath: string;
    readonly content: string;
    readonly isExecutable: boolean;
};

type LegacyImplicitBundleExpectation = {
    readonly name: string;
    readonly packageJson: Readonly<Record<string, unknown>>;
    readonly manifestFile: ManifestFile;
    readonly mainFile: TransferableFile;
    readonly typesMainFile?: TransferableFile | undefined;
};

type ModernImplicitBundleExpectation = {
    readonly packageJson: Readonly<Record<string, unknown>>;
    readonly manifestFile: ManifestFile;
    readonly mainFile: TransferableFile;
    readonly roots: {
        readonly main: {
            readonly js: TransferableFile;
            readonly declarationFile?: TransferableFile | undefined;
        };
    };
    readonly surface: {
        readonly mode: 'implicit';
        readonly defaultModuleRoot: 'main';
    };
    readonly exportsField: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly typesMainFile?: TransferableFile | undefined;
};

type ModernBundleExpectation<TExpected extends LegacyImplicitBundleExpectation> = {
    readonly name: TExpected['name'];
    readonly mainFile: TExpected['mainFile'];
    readonly packageJson: ModernImplicitBundleExpectation['packageJson'];
    readonly manifestFile: ModernImplicitBundleExpectation['manifestFile'];
    readonly roots: ModernImplicitBundleExpectation['roots'];
    readonly surface: ModernImplicitBundleExpectation['surface'];
    readonly exportsField: ModernImplicitBundleExpectation['exportsField'];
    readonly typesMainFile?: ModernImplicitBundleExpectation['typesMainFile'];
};

function omitLegacyPackageFields(packageJson: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(packageJson).filter(function ([ key ]) {
            return key !== 'main' && key !== 'types';
        })
    );
}

export function asImplicitExportsBundle<TExpected extends LegacyImplicitBundleExpectation>(
    expected: TExpected
): ModernBundleExpectation<TExpected> {
    const { packageJson, manifestFile, mainFile, typesMainFile, ...rest } = expected;
    const exportsField = {
        '.': {
            import: `./${mainFile.targetFilePath}`,
            ...typesMainFile === undefined ? {} : { types: `./${typesMainFile.targetFilePath}` }
        }
    };
    const modernPackageJson = {
        ...omitLegacyPackageFields(packageJson),
        exports: exportsField
    };

    const result = {
        ...rest,
        packageJson: modernPackageJson,
        manifestFile: {
            ...manifestFile,
            content: serializePackageJson(modernPackageJson)
        },
        mainFile,
        ...typesMainFile === undefined ? {} : { typesMainFile },
        roots: {
            main: {
                js: mainFile,
                declarationFile: typesMainFile
            }
        },
        surface: {
            mode: 'implicit' as const,
            defaultModuleRoot: 'main' as const
        },
        exportsField
    };

    return result;
}
