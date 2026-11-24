import type { Project, SourceFile } from 'ts-morph';
import type { GlobalPath } from './global-path.ts';

export type IntrinsicIntegrity = {
    readonly isIntact: (path: GlobalPath) => boolean;
};

const untrustedIntrinsics: IntrinsicIntegrity = {
    isIntact() {
        return false;
    }
};

const integrityByProject = new WeakMap<Project, IntrinsicIntegrity>();

export function registerIntrinsicIntegrity(project: Project, integrity: IntrinsicIntegrity): void {
    integrityByProject.set(project, integrity);
}

export function intrinsicIntegrityOf(source: SourceFile): IntrinsicIntegrity {
    return integrityByProject.get(source.getProject()) ?? untrustedIntrinsics;
}
