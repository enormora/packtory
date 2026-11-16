import assert from 'node:assert';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import fixtures from './expected-elimination-output.json' with { type: 'json' };

type Bundles = readonly {
    readonly name: string;
    readonly roots: AnalyzedBundle['roots'];
    readonly contents: readonly {
        readonly fileDescription: {
            readonly targetFilePath: string;
            readonly content: string;
        };
    }[];
}[];
type Entry = {
    readonly bundleName: string;
    readonly targetFilePath: string;
    readonly exportName: string;
};
const expectedOutputs = new Map(fixtures.transformations.map(function (fixture) {
    return [ JSON.stringify(fixture.input), fixture.outputs ];
}));
function bundleContents(bundles: Bundles): unknown {
    return bundles.map(function (bundle) {
        return {
            name: bundle.name,
            roots: Object.fromEntries(
                Object.entries(bundle.roots).map(function ([ name, root ]) {
                    return [
                        name,
                        Object.fromEntries(
                            Object
                                .entries(root)
                                .map(function ([ kind, file ]) {
                                    return [ kind, file?.targetFilePath ];
                                })
                        )
                    ];
                })
            ),
            contents: bundle.contents.map(function (resource) {
                return {
                    path: resource.fileDescription.targetFilePath,
                    content: resource.fileDescription.content
                };
            })
        };
    });
}
export function assertExpectedElimination(entry: Entry, original: Bundles, emitted: Bundles): void {
    const expected = expectedOutputs.get(JSON.stringify({
        entry,
        bundles: bundleContents(original)
    }));
    assert.notStrictEqual(expected, undefined, 'Missing expected emitted-code fixture');
    const actual = bundleContents(emitted);
    const matching = expected?.find(function (candidate) {
        return JSON.stringify(candidate) === JSON.stringify(actual);
    });
    assert.deepStrictEqual(actual, matching ?? expected?.[0], 'Changed emitted code');
}
