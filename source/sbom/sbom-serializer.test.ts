import assert from 'node:assert';
import { test } from 'mocha';
import { buildSbom } from './sbom-builder.ts';
import { createSbomSerializer } from './sbom-serializer.ts';

test('serialize() produces JSON conforming to the CycloneDX 1.6 schema reference', () => {
    const serializer = createSbomSerializer();
    const bom = buildSbom({
        toolVersion: '1.2.3',
        rootComponent: { name: 'my-pkg', version: '1.0.0' },
        dependencies: []
    });

    const result = JSON.parse(serializer.serialize(bom)) as Record<string, unknown>;

    assert.strictEqual(result.specVersion, '1.6');
    assert.strictEqual(result.bomFormat, 'CycloneDX');
});

test('serialize() yields byte-identical output for the same inputs', () => {
    const serializer = createSbomSerializer();
    const buildOptions = {
        toolVersion: '1.2.3',
        rootComponent: { name: 'my-pkg', version: '1.0.0' },
        dependencies: [{ name: 'lodash', specifier: '^4.17.0', kind: 'runtime' as const, license: 'MIT' }]
    };

    const first = serializer.serialize(buildSbom(buildOptions));
    const second = serializer.serialize(buildSbom(buildOptions));

    assert.strictEqual(first, second);
});

test('serialize() produces dependencies independently of the input order when sortLists is enabled', () => {
    const serializer = createSbomSerializer();

    const sortedAscending = serializer.serialize(
        buildSbom({
            toolVersion: '1.2.3',
            rootComponent: { name: 'my-pkg', version: '1.0.0' },
            dependencies: [
                { name: 'a-dep', specifier: '1.0.0', kind: 'runtime', license: 'MIT' },
                { name: 'z-dep', specifier: '1.0.0', kind: 'runtime', license: 'MIT' }
            ]
        })
    );
    const sortedDescending = serializer.serialize(
        buildSbom({
            toolVersion: '1.2.3',
            rootComponent: { name: 'my-pkg', version: '1.0.0' },
            dependencies: [
                { name: 'z-dep', specifier: '1.0.0', kind: 'runtime', license: 'MIT' },
                { name: 'a-dep', specifier: '1.0.0', kind: 'runtime', license: 'MIT' }
            ]
        })
    );

    assert.strictEqual(sortedAscending, sortedDescending);
});
