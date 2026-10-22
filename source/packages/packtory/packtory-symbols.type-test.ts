import { describe, test, expect } from 'tstyche';
import type {
    inspectPackageSymbols,
    PackageSymbolInspection,
    PackageSymbolInspectionOutcome,
    PackageSymbolInspectionResult
} from './packtory.entry-point.ts';

type InspectPackageSymbols = (configuration: unknown, packageName: string) => Promise<PackageSymbolInspectionOutcome>;

describe('inspectPackageSymbols', function () {
    test('exposes the public inspection contract', function () {
        expect<typeof inspectPackageSymbols>().type.toBe<InspectPackageSymbols>();
        expect<PackageSymbolInspectionOutcome['result']>().type.toBe<PackageSymbolInspectionResult>();
        expect<PackageSymbolInspection['packageName']>().type.toBe<string>();
        type Symbol = PackageSymbolInspection['symbols'][number];
        expect<Symbol['packagePath']>().type.toBe<string>();
        expect<Symbol['decision']>().type.toBe<'kept' | 'removed'>();
        expect<Symbol['line']>().type.toBe<number>();
        expect<Symbol['chain'][number]['consumerPackage']>().type.toBe<string | undefined>();
    });
});
