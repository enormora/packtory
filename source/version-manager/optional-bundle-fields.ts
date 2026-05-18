import type { PackageJson } from 'type-fest';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { ImportsField } from './imports/imports-key-matcher.ts';

type OptionalFields = {
    readonly binField?: PackageJson['bin'];
    readonly importsField?: ImportsField;
    readonly typesMainFile?: FileDescription | TransferableFileDescription;
};

export function buildOptionalVersionedBundleFields(params: {
    readonly importsField: ImportsField | undefined;
    readonly binField: PackageJson['bin'] | undefined;
    readonly typesMainFile: FileDescription | TransferableFileDescription | undefined;
}): OptionalFields {
    const { importsField, binField, typesMainFile } = params;

    return {
        ...(importsField === undefined ? {} : { importsField }),
        ...(binField === undefined ? {} : { binField }),
        ...(typesMainFile === undefined ? {} : { typesMainFile })
    };
}
