import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { assertDefined } from './deep-subset-assertion.ts';
import { moduleEliminationInputs } from './eliminator-test-support.ts';
import { assertDeadCodeEliminationEquivalent } from './dead-code-elimination-oracle-test-support.ts';

function moduleContents(bundle: AnalyzedBundle): ReadonlyMap<string, string> {
    return new Map(bundle.contents.map(function (resource) {
        return [ resource.fileDescription.targetFilePath, resource.fileDescription.content ];
    }));
}

export async function assertEquivalentModules(
    name: string,
    content: string,
    modules: Readonly<Record<string, string>>
): Promise<ReadonlyMap<string, string>> {
    const input = {
        name,
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        eliminationInputs: moduleEliminationInputs(content, modules)
    };
    const [ result ] = await assertDeadCodeEliminationEquivalent(input);
    if (Object.keys(modules).length > 0) {
        await assertDeadCodeEliminationEquivalent({
            ...input,
            eliminationInputs: input.eliminationInputs.map(function (entry) {
                return { ...entry, bundle: { ...entry.bundle, contents: entry.bundle.contents.toReversed() } };
            })
        });
    }
    assertDefined(result);
    return moduleContents(result);
}
