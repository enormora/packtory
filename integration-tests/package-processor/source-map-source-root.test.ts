import path from 'node:path';
import assert from 'node:assert';
import { decodedMappings, originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';

async function buildConsumer(enabled: boolean): ReturnType<typeof packageProcessor.build> {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/source-map-linker-rewrite');
    const settings = {
        version: '1.0.0',
        sourcesFolder: path.join(fixture, 'source'),
        mainPackageManifest: await loadPackageManifest(fixture),
        includeSourceMapFiles: true,
        additionalFiles: [],
        bundlePeerDependencies: [],
        additionalPackageManifestAttributes: {},
        allowMutableSpecifiers: [],
        deadCodeElimination: { enabled }
    };
    const providerBundle = await packageProcessor.build({
        ...settings,
        name: 'provider-package',
        roots: { main: { javaScript: path.join(fixture, 'source/provider.js') } },
        bundleDependencies: []
    });
    return packageProcessor.build({
        ...settings,
        name: 'consumer-package',
        roots: { main: { javaScript: path.join(fixture, 'source/consumer-with-dead-code.js') } },
        bundleDependencies: [ providerBundle ]
    });
}

function assertAuthoredPosition(code: string, map: string): void {
    const traceMap = new TraceMap(map);
    const prefixLines = code.slice(0, code.indexOf('value')).split('\n');
    const position = originalPositionFor(traceMap, {
        line: prefixLines.length,
        column: prefixLines.at(-1)?.length ?? 0
    });
    assert.deepStrictEqual(position, { source: '/authored/consumer.ts', line: 3, column: 13, name: 'value' });
    assert.partialDeepStrictEqual(traceMap, {
        sourceRoot: '/authored',
        sources: [ 'consumer.ts' ],
        sourcesContent: [ "import { dep } from './provider.js';\nconst dead = 1;\nexport const value = dep;\n" ]
    });
    const segments = decodedMappings(traceMap).flat();
    assert.ok(segments.length > 0);
    for (const segment of segments) {
        assert.strictEqual(segment[1], 0);
    }
}

suite('source maps with sourceRoot', function () {
    for (const enabled of [ false, true ]) {
        test(`traces authored sources after linking with dead code elimination ${String(enabled)}`, async function () {
            const consumerBundle = await buildConsumer(enabled);
            const codeResource = consumerBundle
                .contents
                .find(function (resource) {
                    return resource.fileDescription.targetFilePath === 'consumer-with-dead-code.js';
                });
            const mapResource = consumerBundle
                .contents
                .find(function (resource) {
                    return resource.fileDescription.targetFilePath === 'consumer-with-dead-code.js.map';
                });

            if (codeResource === undefined || mapResource === undefined) {
                assert.fail('Expected both the emitted code and its source map');
            }
            assert.ok(codeResource.fileDescription.content.includes("from 'provider-package'"));
            assert.strictEqual(codeResource.fileDescription.content.includes('const dead'), !enabled);
            assertAuthoredPosition(codeResource.fileDescription.content, mapResource.fileDescription.content);
        });
    }
});
