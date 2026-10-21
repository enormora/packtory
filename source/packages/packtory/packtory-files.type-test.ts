import { describe, test, expect } from 'tstyche';
import type {
    inspectPackageFiles,
    PackageFileInspection,
    PackageFileInspectionOutcome,
    PackageFileInspectionResult
} from './packtory.entry-point.ts';

type InspectPackageFiles = (configuration: unknown, packageName: string) => Promise<PackageFileInspectionOutcome>;

describe('inspectPackageFiles', function () {
    test('exposes the public inspection contract', function () {
        expect<typeof inspectPackageFiles>().type.toBe<InspectPackageFiles>();
        expect<PackageFileInspectionOutcome['result']>().type.toBe<PackageFileInspectionResult>();
        expect<PackageFileInspection['packageName']>().type.toBe<string>();
        type File = PackageFileInspection['files'][number];
        expect<File['packagePath']>().type.toBe<string>();
        expect<File['sourcePath']>().type.toBe<string | undefined>();
        expect<File['discovery']['type']>().type.toBe<'discovered' | 'unavailable'>();
        type Discovery = Extract<File['discovery'], { readonly type: 'discovered'; }>;
        expect<Discovery['chain'][number]['sourcePath']>().type.toBe<string | undefined>();
    });
});
