import { isDefined } from 'remeda';

export type ReleaseWorkflow = { readonly id: number; readonly name: string; readonly path: string };

export type ReleaseWorkflowRun = {
    readonly databaseId?: number | undefined;
    readonly database_id?: number | undefined;
    readonly event: string;
    readonly head_sha: string;
    readonly name?: string | null | undefined;
    readonly path?: string | null | undefined;
    readonly workflow_id?: number | null | undefined;
};

export type WorkflowRunLookupResult = {
    readonly event: 'workflow_dispatch';
    readonly observedRunIds: readonly number[];
    readonly runId: number | undefined;
};

export function runDatabaseId(run: ReleaseWorkflowRun): number | undefined {
    return run.database_id ?? run.databaseId;
}

function workflowRunPathMatches(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return (
        run.path === undefined ||
        run.path === null ||
        run.path === workflow.path ||
        run.path.endsWith(`/${workflow.path}`)
    );
}

function workflowRunIdMatches(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return run.workflow_id === undefined || run.workflow_id === null || run.workflow_id === workflow.id;
}

function workflowRunNameMatches(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return run.name === undefined || run.name === null || run.name === workflow.name;
}

function workflowRunMatchesIdentity(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return (
        workflowRunIdMatches(run, workflow) &&
        workflowRunPathMatches(run, workflow) &&
        workflowRunNameMatches(run, workflow)
    );
}

function workflowRunMatchesInput(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow, headSha: string): boolean {
    return run.head_sha === headSha && run.event === 'workflow_dispatch' && workflowRunMatchesIdentity(run, workflow);
}

export function workflowMatchesIdentifier(workflow: ReleaseWorkflow, identifier: string): boolean {
    return (
        String(workflow.id) === identifier ||
        workflow.name === identifier ||
        workflow.path === identifier ||
        workflow.path.endsWith(`/${identifier}`)
    );
}

export function selectReleaseWorkflow(identifier: string, matches: readonly ReleaseWorkflow[]): ReleaseWorkflow {
    const workflow = matches[0];
    if (workflow === undefined) {
        throw new Error(`GitHub Actions workflow "${identifier}" was not found`);
    }
    if (matches.length === 1) {
        return { id: workflow.id, name: workflow.name, path: workflow.path };
    }
    throw new Error(`GitHub Actions workflow "${identifier}" matched multiple workflows`);
}

export function findWorkflowRunIdInRuns(
    runs: readonly ReleaseWorkflowRun[],
    workflow: ReleaseWorkflow,
    headSha: string
): number | undefined {
    const matchingRunIds = runs
        .filter((workflowRun) => {
            return workflowRunMatchesInput(workflowRun, workflow, headSha);
        })
        .map(runDatabaseId)
        .filter(isDefined);
    return matchingRunIds.length === 0 ? undefined : Math.max(...matchingRunIds);
}

export function observedWorkflowRunIds(runs: readonly ReleaseWorkflowRun[]): readonly number[] {
    return runs.map(runDatabaseId).filter(isDefined);
}
