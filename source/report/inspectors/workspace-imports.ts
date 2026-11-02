import type { ResolvedBundle } from '../../resource-resolver/resolved-bundle.ts';

export type WorkspaceImport = {
    readonly packageName: string;
    readonly sourcePath: string;
    readonly sourceSpecifier: string;
    readonly emittedSpecifier: string;
};

export function inspectWorkspaceImports(bundle: Pick<ResolvedBundle, 'contents'>): readonly WorkspaceImport[] {
    return bundle.contents.flatMap(function (resource) {
        return resource.moduleReferences.flatMap(function (reference): readonly WorkspaceImport[] {
            if (reference.type !== 'external-package' && reference.type !== 'linked-code') {
                return [];
            }
            return [ {
                packageName: reference.packageName,
                sourcePath: resource.fileDescription.targetFilePath,
                sourceSpecifier: reference.sourceSpecifier,
                emittedSpecifier: reference.emittedSpecifier
            } ];
        });
    });
}
