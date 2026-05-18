import type { BundleLike, ImplicitSurface } from './package-shape.ts';
import { getRoot } from './root-registry.ts';
import { resolveImplicitSpecifier, type ImplicitSpecifierResolution } from './specifier-syntax.ts';

type ImplicitResolveBundle = Pick<BundleLike, 'contents' | 'name' | 'roots'>;

type ResolutionHandlers = Readonly<
    Record<Exclude<ImplicitSpecifierResolution[0], 'private'>, () => string | undefined>
>;

export function resolveImplicitPublicModuleSourceFilePath(
    bundle: ImplicitResolveBundle,
    surface: ImplicitSurface,
    specifier: string
): string | undefined {
    const [kind, targetFilePath] = resolveImplicitSpecifier(bundle.name, specifier);
    const handlers: ResolutionHandlers = {
        root: (): string => {
            return getRoot(bundle, surface.defaultModuleRoot).js.sourceFilePath;
        },
        content: (): string | undefined => {
            return bundle.contents.find((entry) => {
                return entry.fileDescription.targetFilePath === targetFilePath;
            })?.fileDescription.sourceFilePath;
        }
    };

    return kind === 'private' ? undefined : handlers[kind]();
}
