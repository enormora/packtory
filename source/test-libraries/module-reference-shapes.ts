import assert from 'node:assert';
import { getReferencedModules } from '../dependency-scanner/source-file-references.ts';
import { createProject } from './typescript-project.ts';

type ModuleReference = ReturnType<typeof getReferencedModules>[number];

type ExternalPackageReferenceShape = {
    readonly kind: 'external-package';
    readonly packageName: string;
    readonly specifier: string;
};

type FileReferenceShape = {
    readonly kind: string;
    readonly filePath: string;
};

export type ModuleReferenceShape = ExternalPackageReferenceShape | FileReferenceShape;

function moduleReferenceShape(reference: ModuleReference): ModuleReferenceShape {
    if (reference.kind === 'external-package') {
        return { kind: reference.kind, packageName: reference.packageName, specifier: reference.emittedSpecifier };
    }
    return { kind: reference.kind, filePath: reference.filePath };
}

export function moduleReferenceShapes(references: readonly ModuleReference[]): readonly ModuleReferenceShape[] {
    return references.map(moduleReferenceShape);
}

export function expectModuleReferenceResolutionFailure(content: string, expectedMessage: string): void {
    const project = createProject({ withFiles: [ { filePath: 'main.ts', content } ] });

    try {
        getReferencedModules(project.getSourceFileOrThrow('main.ts'), '/package.json');
        assert.fail('Expected getReferencedModules() should fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expectedMessage);
    }
}
