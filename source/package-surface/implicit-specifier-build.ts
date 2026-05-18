import type { BundleLike, ImplicitSurface } from './package-shape.ts';
import { getRoot, isMatchingRootSourcePath } from './root-registry.ts';

type ImplicitBuildBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'>;

function getDefaultRootSpecifier(
    bundle: Pick<ImplicitBuildBundle, 'name' | 'roots'>,
    surface: ImplicitSurface,
    sourceFilePath: string
): string | undefined {
    return isMatchingRootSourcePath(getRoot(bundle, surface.defaultModuleRoot), sourceFilePath)
        ? bundle.name
        : undefined;
}

function getDeclarationRootSpecifier(
    bundle: Pick<ImplicitBuildBundle, 'name' | 'roots'>,
    sourceFilePath: string
): string | undefined {
    const declarationRoot = Object.values(bundle.roots).find((root) => {
        return root.declarationFile?.sourceFilePath === sourceFilePath;
    });
    return declarationRoot === undefined ? undefined : `${bundle.name}/${declarationRoot.js.targetFilePath}`;
}

function getContentSpecifier(
    bundle: Pick<ImplicitBuildBundle, 'contents' | 'name'>,
    sourceFilePath: string
): string | undefined {
    const content = bundle.contents.find((entry) => {
        return entry.fileDescription.sourceFilePath === sourceFilePath;
    });
    return content === undefined ? undefined : `${bundle.name}/${content.fileDescription.targetFilePath}`;
}

export function getImplicitPublicModuleSpecifier(
    bundle: ImplicitBuildBundle,
    surface: ImplicitSurface,
    sourceFilePath: string
): string | undefined {
    const defaultSpecifier = getDefaultRootSpecifier(bundle, surface, sourceFilePath);
    if (defaultSpecifier !== undefined) {
        return defaultSpecifier;
    }
    return getDeclarationRootSpecifier(bundle, sourceFilePath) ?? getContentSpecifier(bundle, sourceFilePath);
}
