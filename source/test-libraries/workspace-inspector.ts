import { createWorkspaceInspector, type WorkspaceInspector } from '../report/inspectors/inspect-workspace.ts';
import { createProject } from './typescript-project.ts';

export const inspectWorkspace: WorkspaceInspector = function (bundle, manifest) {
    return createWorkspaceInspector(createProject)(bundle, manifest);
};
