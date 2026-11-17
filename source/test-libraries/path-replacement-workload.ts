import type { BundleSubstitutionSource } from '../linker/linked-bundle.ts';
import type { ImportPathReplacementRequest } from '../linker/replacement-lookup.ts';
import { explicitPackageSurface } from '../package-surface/surface.ts';

export type PathReplacementWorkload = {
    readonly bundle: BundleSubstitutionSource;
    readonly requests: readonly ImportPathReplacementRequest[];
    readonly sourceReads: () => number;
};

export function createPathReplacementWorkload(moduleCount: number, exportsPerModule: number): PathReplacementWorkload {
    let sourceReads = 0;
    function resource(targetFilePath: string, source: string): BundleSubstitutionSource['contents'][number] {
        return {
            directDependencies: new Set(),
            fileDescription: {
                inputFilePath: `/source/${targetFilePath}`,
                targetFilePath,
                isExecutable: false,
                get content() {
                    sourceReads += 1;
                    return source;
                }
            }
        };
    }
    const modules = Array.from({ length: moduleCount }, function (_value, index) {
        const names = Array.from({ length: exportsPerModule }, function (_entry, exportIndex) {
            return `value${index}_${exportIndex}`;
        });
        return {
            resource: resource(
                `module-${index}.js`,
                names
                    .map(function (name) {
                        return `export const ${name} = ${index};`;
                    })
                    .join('\n')
            ),
            exports: `export { ${names.join(', ')} } from './module-${index}.js';`,
            request: {
                inputFilePath: `/source/module-${index}.js`,
                requiredExportNames: new Set(names),
                requiresNamespaceExport: false
            }
        };
    });
    const rootResource = resource(
        'entry.js',
        modules
            .map(function (entry) {
                return entry.exports;
            })
            .join('\n')
    );
    const bundle: BundleSubstitutionSource = {
        name: 'replacement-package',
        roots: { main: { javaScript: rootResource.fileDescription } },
        surface: explicitPackageSurface({ modules: [ { root: 'main', export: '.' } ] }),
        contents: [
            rootResource,
            ...modules.map(function (entry) {
                return entry.resource;
            })
        ]
    };
    const requests: readonly ImportPathReplacementRequest[] = modules.map(function (entry) {
        return entry.request;
    });
    return {
        bundle,
        requests,
        sourceReads() {
            return sourceReads;
        }
    };
}
