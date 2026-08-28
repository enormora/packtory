import { describe, test, expect } from 'tstyche';
import type {
    inspectPackageSideEffects,
    PackageSideEffectsInspection,
    PackageSideEffectsInspectionOutcome,
    PackageSideEffectsInspectionResult
} from './packtory.entry-point.ts';

type InspectPackageSideEffectsFunction = (
    config: unknown,
    packageName: string
) => Promise<PackageSideEffectsInspectionOutcome>;

type PackageSideEffectsDecisionTypes = readonly [
    'side-effects-false',
    'side-effects-list',
    'side-effects-omitted',
    'user-provided-side-effects'
];
type PackageSideEffectsDecisionType = PackageSideEffectsDecisionTypes[number];

describe('inspectPackageSideEffects', function () {
    test('takes an unknown config and package name and returns an inspection outcome', function () {
        expect<typeof inspectPackageSideEffects>().type.toBe<InspectPackageSideEffectsFunction>();
    });
});

describe('PackageSideEffectsInspectionOutcome', function () {
    test('exposes the wrapped result', function () {
        expect<PackageSideEffectsInspectionOutcome['result']>().type.toBe<PackageSideEffectsInspectionResult>();
    });

    test('the ok value exposes side effect decisions for one package', function () {
        type File = PackageSideEffectsInspection['impureFiles'][number];
        type Statement = File['statements'][number];
        expect<PackageSideEffectsInspection['packageName']>().type.toBe<string>();
        expect<PackageSideEffectsInspection['packageJsonDecision']['type']>().type.toBe<
            PackageSideEffectsDecisionType
        >();
        expect<File['sourcePath']>().type.toBe<string>();
        expect<File['packagePath']>().type.toBe<string>();
        expect<Statement['line']>().type.toBe<number>();
        expect<Statement['kind']>().type.toBe<string>();
    });
});
