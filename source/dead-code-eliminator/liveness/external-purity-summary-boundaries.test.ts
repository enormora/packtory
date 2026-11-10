import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { exportPurityForOrigin } from './external-purity-summary.ts';

suite('external purity summary boundaries', function () {
    for (
        const [ content, path, expected ] of [
            [ 'export const z={value:42};', [ 'z', 'value' ], 'unknown' ],
            [ 'export const z={value:{}};', [ 'z', 'value' ], 'pure-object' ],
            [ 'export const z={[key]:()=>1};', [ 'z' ], 'unknown' ],
            [
                'export const factory=()=>({get value(){return 1;}});',
                [ 'factory', { type: 'call-result' } ],
                'unknown'
            ],
            [
                'export const factory=()=>({method(){return 1;}});',
                [ 'factory', { type: 'call-result' }, 'method' ],
                'pure-callable'
            ],
            [ 'export const z={mutate(){this.value=1;}};z.mutate();', [ 'z' ], 'unknown' ]
        ] as const
    ) {
        test(`classifies ${JSON.stringify(path)} from ${content}`, function () {
            const fixture = createExportModuleFixture({
                'index.js': 'import * as library from "./library.js";',
                'library.js': content
            }, []);
            assert.strictEqual(
                exportPurityForOrigin({ from: './library.js', path }, fixture.source('index.js'), resolveRuntimeModule),
                expected
            );
        });
    }
});
