import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import { createProject } from './typescript-project.ts';

export type TestEliminator = DeadCodeEliminator;

const noopProvider = {
    emit(): void {
        return undefined;
    },
    hasSubscribers(): boolean {
        return false;
    }
};

export function createTestEliminator(): DeadCodeEliminator {
    return createDeadCodeEliminator({
        createProject() {
            return createProject();
        },
        progressBroadcaster: noopProvider
    });
}
