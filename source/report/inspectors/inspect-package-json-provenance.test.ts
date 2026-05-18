import assert from 'node:assert';
import { test } from 'mocha';
import { inspectPackageJsonProvenance } from './inspect-package-json-provenance.ts';

test('inspectPackageJsonProvenance marks fields present in mainPackageJson', () => {
    const provenance = inspectPackageJsonProvenance(
        { name: 'pkg', version: '1.0.0', type: 'module' },
        { type: 'module' },
        undefined
    );

    assert.deepStrictEqual(provenance.type, { source: 'mainPackageJson' });
});

test('inspectPackageJsonProvenance marks fields present in additionalAttributes', () => {
    const provenance = inspectPackageJsonProvenance(
        { name: 'pkg', version: '1.0.0', publishConfig: { access: 'public' } },
        {},
        { publishConfig: { access: 'public' } }
    );

    assert.deepStrictEqual(provenance.publishConfig, { source: 'additionalAttributes' });
});

test('inspectPackageJsonProvenance marks fields not in any source as derived', () => {
    const provenance = inspectPackageJsonProvenance({ name: 'pkg', version: '1.0.0' }, {}, undefined);

    assert.deepStrictEqual(provenance.name, { source: 'derived' });
    assert.deepStrictEqual(provenance.version, { source: 'derived' });
});

test('inspectPackageJsonProvenance prefers additionalAttributes over mainPackageJson when both contain the field', () => {
    const provenance = inspectPackageJsonProvenance(
        { keywords: ['a', 'b'] },
        { keywords: ['x'] },
        { keywords: ['a', 'b'] }
    );

    assert.deepStrictEqual(provenance.keywords, { source: 'additionalAttributes' });
});

test('inspectPackageJsonProvenance treats undefined additionalAttributes as absent', () => {
    const provenance = inspectPackageJsonProvenance({ name: 'pkg' }, { name: 'pkg' }, undefined);
    assert.deepStrictEqual(provenance, { name: { source: 'mainPackageJson' } });
});

test('inspectPackageJsonProvenance returns an empty object for an empty assembled manifest', () => {
    const provenance = inspectPackageJsonProvenance({}, { name: 'pkg' }, { scripts: {} });
    assert.deepStrictEqual(provenance, {});
});
