import { createDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import { createProject } from './typescript-project.ts';

export function createTestEliminator(): ReturnType<typeof createDeadCodeEliminator> {
    return createDeadCodeEliminator({ createProject: () => createProject() });
}
