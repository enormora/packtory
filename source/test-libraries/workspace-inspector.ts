import { createWorkspaceInspector } from '../report/inspectors/inspect-workspace.ts';
import { createProject } from './typescript-project.ts';

export const inspectWorkspace = createWorkspaceInspector(createProject);
