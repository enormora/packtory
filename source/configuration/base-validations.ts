import path from 'node:path';
import { z } from 'zod/mini';

export const nonEmptyStringSchema = z.string().check(z.minLength(1));

function isBundleRelativePath(value: string): boolean {
    if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
        return false;
    }
    const segments = value.split(/[/\\]/u);
    return !segments.includes('..');
}

export const bundleRelativePathSchema = z.string().check(z.minLength(1), z.refine(isBundleRelativePath));
