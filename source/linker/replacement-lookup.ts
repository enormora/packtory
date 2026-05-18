import { Maybe } from 'true-myth';
import { getPublicModuleSpecifierForSourcePath } from '../package-surface/public-specifiers.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';

type Replacement = {
    readonly targetPath: string;
    readonly packageName: string;
};

export type Replacements = {
    readonly importPathReplacements: Map<string, string>;
    readonly bundleDependencies: readonly string[];
};

function ownsSourcePath(file: string, bundle: BundleSubstitutionSource): boolean {
    return bundle.contents.some((content) => {
        return content.fileDescription.sourceFilePath === file;
    });
}

function findReplacement(file: string, bundleDependencies: readonly BundleSubstitutionSource[]): Maybe<Replacement> {
    for (const bundle of bundleDependencies) {
        const targetPath = getPublicModuleSpecifierForSourcePath(bundle, file);
        if (targetPath !== undefined) {
            return Maybe.just({
                targetPath,
                packageName: bundle.name
            });
        }
        if (ownsSourcePath(file, bundle)) {
            throw new Error(`Package "${bundle.name}" does not expose "${file}" for cross-package substitution`);
        }
    }

    return Maybe.nothing();
}

export function findAllPathReplacements(
    files: readonly string[],
    bundleDependencies: readonly BundleSubstitutionSource[]
): Replacements {
    const matched = files.flatMap((file) => {
        const result = findReplacement(file, bundleDependencies);
        if (!result.isJust) {
            return [];
        }
        const { targetPath, packageName } = result.value;
        return [{ file, targetPath, packageName }];
    });

    return {
        importPathReplacements: new Map(
            matched.map((entry) => {
                return [entry.file, entry.targetPath];
            })
        ),
        bundleDependencies: matched.map((entry) => {
            return entry.packageName;
        })
    };
}
