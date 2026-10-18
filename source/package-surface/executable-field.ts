import type { PackageJson as PackageManifest } from 'type-fest';
import { buildExplicitExecutableField } from './explicit-executable.ts';
import { buildImplicitExecutableField } from './implicit-executable.ts';
import type { BundleLike } from './package-shape.ts';

export type SurfaceBundleLike = Pick<BundleLike, 'name' | 'roots' | 'surface'>;

export function buildExecutableField(bundle: SurfaceBundleLike): PackageManifest['bin'] | undefined {
    if (bundle.surface.mode === 'explicit') {
        return buildExplicitExecutableField(bundle, bundle.surface);
    }
    return buildImplicitExecutableField(bundle);
}
