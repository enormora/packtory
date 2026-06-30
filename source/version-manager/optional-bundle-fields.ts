import type { PackageJson } from 'type-fest';
import { isDefined, pickBy } from 'remeda';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { ImportsField } from './imports/imports-key-matcher.ts';

type OptionalFields = {
    readonly binField?: PackageJson['bin'];
    readonly importsField?: ImportsField;
    readonly typesMainFile?: FileDescription | TransferableFileDescription;
};

type OptionalVersionedBundleFieldsInput = {
    readonly importsField: ImportsField | undefined;
    readonly binField: PackageJson['bin'] | undefined;
    readonly typesMainFile: FileDescription | TransferableFileDescription | undefined;
};

export function buildOptionalVersionedBundleFields(params: OptionalVersionedBundleFieldsInput): OptionalFields {
    const { importsField, binField, typesMainFile } = params;

    return pickBy({ importsField, binField, typesMainFile }, isDefined);
}
