import type { PackageJson as PackageManifest } from 'type-fest';
import { isDefined, pickBy } from 'remeda';
import type { FileDescription, TransferableFileDescription } from '../file-manager/file-description.ts';
import type { ImportsField } from './imports/imports-key-matcher.ts';

type OptionalFields = {
    readonly executableField?: PackageManifest['bin'];
    readonly importsField?: ImportsField;
    readonly typesMainFile?: FileDescription | TransferableFileDescription;
};

type OptionalVersionedBundleFieldsInput = {
    readonly importsField: ImportsField | undefined;
    readonly executableField: PackageManifest['bin'] | undefined;
    readonly typesMainFile: FileDescription | TransferableFileDescription | undefined;
};

export function buildOptionalVersionedBundleFields(input: OptionalVersionedBundleFieldsInput): OptionalFields {
    const { importsField, executableField, typesMainFile } = input;

    return pickBy({ importsField, executableField, typesMainFile }, isDefined);
}
