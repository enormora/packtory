import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { assertDefined } from './deep-subset-assertion.ts';
import { moduleEliminationInputs } from './eliminator-test-support.ts';
import { assertDeadCodeEliminationOutput } from './dead-code-elimination-output-assertions.ts';

function moduleContents(bundle: AnalyzedBundle): ReadonlyMap<string, string> {
    return new Map(bundle.contents.map(function (resource) {
        return [ resource.fileDescription.targetFilePath, resource.fileDescription.content ];
    }));
}

export async function assertModuleEliminationOutput(
    name: string,
    content: string,
    modules: Readonly<Record<string, string>>
): Promise<ReadonlyMap<string, string>> {
    const input = {
        name,
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        eliminationInputs: moduleEliminationInputs(content, modules)
    };
    const { bundles } = await assertDeadCodeEliminationOutput(input);
    const [ result ] = bundles;
    if (Object.keys(modules).length > 0) {
        await assertDeadCodeEliminationOutput({
            ...input,
            eliminationInputs: input.eliminationInputs.map(function (entry) {
                return { ...entry, bundle: { ...entry.bundle, contents: entry.bundle.contents.toReversed() } };
            })
        });
    }
    assertDefined(result);
    return moduleContents(result);
}
