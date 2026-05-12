import { createDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import { createProject } from './typescript-project.ts';

const noopProvider = {
    emit: (): void => {
        return undefined;
    },
    hasSubscribers: (): boolean => {
        return false;
    }
};

export function createTestEliminator(): ReturnType<typeof createDeadCodeEliminator> {
    return createDeadCodeEliminator({
        createProject: () => createProject(),
        progressBroadcaster: noopProvider
    });
}
