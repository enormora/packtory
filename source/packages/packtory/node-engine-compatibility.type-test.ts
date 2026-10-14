import { describe, expect, test } from 'tstyche';
import type { PacktoryConfig } from './packtory.entry-point.ts';

describe('Node engine compatibility configuration', function () {
    test('exposes the opt-in check through the public configuration', function () {
        type Settings = NonNullable<PacktoryConfig['checks']>;
        type EngineSettings = NonNullable<Settings['nodeEngineCompatibility']>;
        expect<EngineSettings['enabled']>().type.toBe<boolean>();
        expect<Settings['nodeEngineCompatibility']>().type.toBe<EngineSettings | undefined>();
    });
});
