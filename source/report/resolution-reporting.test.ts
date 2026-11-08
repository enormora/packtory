import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { reportResolvedInputs } from './resolution-reporting.ts';

suite('resolution reporting', function () {
    test('reports JSON and declaration entry paths without JavaScript roots', function () {
        const broadcaster = createProgressBroadcaster();
        const received: unknown[] = [];
        broadcaster.consumer.on('inputsResolved', function (payload) {
            received.push(payload);
        });
        reportResolvedInputs(broadcaster.provider, {
            name: 'data',
            sourcesFolder: '/source',
            includeSourceMapFiles: false,
            additionalFiles: [],
            mainPackageManifest: { type: 'module' },
            roots: {
                data: { json: '/source/config.json' },
                types: { declarationFile: '/source/index.d.ts' }
            },
            surface: { mode: 'implicit', defaultModuleRoot: 'types' }
        });
        assert.deepStrictEqual(received, [ {
            packageName: 'data',
            roots: { data: '/source/config.json', types: '/source/index.d.ts' },
            sourceFileCount: 0,
            siblingVersions: {}
        } ]);
    });
});
