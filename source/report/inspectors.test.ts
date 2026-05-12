import assert from 'node:assert';
import { test } from 'mocha';
import { inspectArtifactSizes, inspectPackageJsonProvenance } from './inspectors.ts';

test('inspectArtifactSizes maps file paths and content lengths', () => {
    const entries = inspectArtifactSizes([
        { filePath: 'package.json', content: '{"name":"a"}', isExecutable: false },
        { filePath: 'src/index.js', content: 'export const a = 1;', isExecutable: false }
    ]);

    assert.deepStrictEqual(entries, [
        { path: 'package.json', sizeBytes: 12, kind: 'manifest' },
        { path: 'src/index.js', sizeBytes: 19, kind: 'source' }
    ]);
});

test('inspectArtifactSizes recognizes sbom files', () => {
    const entries = inspectArtifactSizes([
        { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false },
        { filePath: 'project.sbom.json', content: '{}', isExecutable: false }
    ]);

    assert.deepStrictEqual(
        entries.map((entry) => entry.kind),
        ['sbom', 'sbom']
    );
});

test('inspectArtifactSizes treats unknown files as additional', () => {
    const entries = inspectArtifactSizes([{ filePath: 'README.md', content: '# hi', isExecutable: false }]);

    assert.strictEqual(entries[0]?.kind, 'additional');
});

test('inspectArtifactSizes returns utf-8 byte length for multi-byte content', () => {
    const entries = inspectArtifactSizes([{ filePath: 'note.txt', content: '✓', isExecutable: false }]);

    assert.strictEqual(entries[0]?.sizeBytes, 3);
});

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
