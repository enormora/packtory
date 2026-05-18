import type { PackageJson } from 'type-fest';
import { buildExplicitBinField } from './explicit-bin.ts';
import { buildImplicitBinField } from './implicit-bin.ts';
import type { BundleLike } from './package-shape.ts';

export type SurfaceBundleLike = Pick<BundleLike, 'name' | 'roots' | 'surface'>;

export function buildBinField(bundle: SurfaceBundleLike): PackageJson['bin'] | undefined {
    if (bundle.surface.mode === 'explicit') {
        return buildExplicitBinField(bundle, bundle.surface);
    }
    return buildImplicitBinField(bundle);
}
