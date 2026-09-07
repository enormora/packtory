import path from 'node:path';

export function resolveRelativeTargetModulePath(importerTargetPath: string, specifier: string): string {
    return path.posix.normalize(path.posix.join(path.posix.dirname(importerTargetPath), specifier));
}
