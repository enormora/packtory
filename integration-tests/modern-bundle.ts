import type { Except } from 'type-fest';
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
    readonly packageJson: Record<string, unknown>;
    readonly manifestFile: ManifestFile;
    readonly mainFile: TransferableFile;
    readonly typesMainFile?: TransferableFile | undefined;
};

type ModernImplicitBundleExpectation = {
    readonly packageJson: Record<string, unknown>;
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
    readonly exportsField: Record<string, Record<string, string>>;
    readonly typesMainFile?: TransferableFile | undefined;
};

function omitLegacyPackageFields(packageJson: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(packageJson).filter(([key]) => {
            return key !== 'main' && key !== 'types';
        })
    );
}

export function asImplicitExportsBundle<TExpected extends LegacyImplicitBundleExpectation>(
    expected: TExpected
): Except<TExpected, 'manifestFile' | 'packageJson' | 'typesMainFile'> & ModernImplicitBundleExpectation {
    const { packageJson, manifestFile, mainFile, typesMainFile, ...rest } = expected;
    const exportsField = {
        '.': {
            import: `./${mainFile.targetFilePath}`,
            ...(typesMainFile === undefined ? {} : { types: `./${typesMainFile.targetFilePath}` })
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
        ...(typesMainFile === undefined ? {} : { typesMainFile }),
        roots: {
            main: {
                js: mainFile,
                declarationFile: typesMainFile
            }
        },
        surface: {
            mode: 'implicit',
            defaultModuleRoot: 'main'
        },
        exportsField
    };

    return result as unknown as Except<TExpected, 'manifestFile' | 'packageJson' | 'typesMainFile'> &
        ModernImplicitBundleExpectation;
}
