import path from 'node:path';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource } from './bundle-fixtures.ts';
import { assertDefined } from './deep-subset-assertion.ts';

export type PublicModuleUsageWorkloadDefinition = {
    readonly moduleCount: number;
    readonly importCount: number;
    readonly sourcesFolder: string;
};

export type PublicModuleUsageWorkload = {
    readonly target: AnalyzedBundle;
    readonly consumer: AnalyzedBundle;
    readonly expectedUsage: ReadonlyMap<string, ReadonlySet<string>>;
    readonly surfaceReads: () => number;
};

function moduleResources(index: number, sourcesFolder: string): readonly AnalyzedBundleResource[] {
    return [
        analyzedBundleResource(path.join(sourcesFolder, `module-${index}.js`), {
            targetFilePath: `module-${index}.js`,
            content: `export const value = ${index};`
        }),
        analyzedBundleResource(path.join(sourcesFolder, `module-${index}.d.ts`), {
            targetFilePath: `module-${index}.d.ts`,
            content: 'export declare const value: number;'
        })
    ];
}

function consumerBundle(importCount: number): AnalyzedBundle {
    const content = Array
        .from({ length: importCount }, function (_value, index) {
            return [
                `import { value as value${index} } from "indexed-package/module-${index}.js";`,
                `import "unrelated-${index}";`
            ]
                .join('\n');
        })
        .join('\n');
    return analyzedBundle({
        name: 'consumer',
        contents: [ analyzedBundleResource('/consumer/index.js', { targetFilePath: 'index.js', content }) ]
    });
}

export function createPublicModuleUsageWorkload(
    definition: PublicModuleUsageWorkloadDefinition
): PublicModuleUsageWorkload {
    const contents = Array.from({ length: definition.moduleCount }).flatMap(function (_value, index) {
        return moduleResources(index, definition.sourcesFolder);
    });
    const [ entry ] = contents;
    assertDefined(entry);
    const target = analyzedBundle({
        name: 'indexed-package',
        contents,
        roots: { main: { javaScript: entry.fileDescription } },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
    let reads = 0;
    return {
        target: {
            ...target,
            get surface() {
                reads += 1;
                return target.surface;
            }
        },
        consumer: consumerBundle(definition.importCount),
        expectedUsage: definition.importCount === 0 ? new Map() : new Map([ [
            target.name,
            new Set(Array.from({ length: definition.importCount }, function (_value, index) {
                return path.join(definition.sourcesFolder, `module-${index}.js`);
            }))
        ] ]),
        surfaceReads() {
            return reads;
        }
    };
}
