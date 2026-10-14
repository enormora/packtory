import { isDefined } from 'remeda';

export type ReleaseWorkflow = { readonly identifier: number; readonly name: string; readonly path: string; };

export type ReleaseWorkflowRun = {
    readonly databaseId?: number | undefined;
    readonly database_id?: number | undefined;
    readonly event: string;
    readonly head_sha: string;
    readonly id?: number | undefined;
    readonly name?: string | null | undefined;
    readonly path?: string | null | undefined;
    readonly workflow_id?: number | null | undefined;
};

export type WorkflowRunLookupResult = {
    readonly event: 'workflow_dispatch';
    readonly observedRunIdentifiers: readonly number[];
    readonly runIdentifier: number | undefined;
};

export function readWorkflowRunIdentifier(workflowRun: ReleaseWorkflowRun): number | undefined {
    return workflowRun.id ?? workflowRun.database_id ?? workflowRun.databaseId;
}

function workflowRunPathMatches(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return (
        run.path === undefined ||
        run.path === null ||
        run.path === workflow.path ||
        run.path.endsWith(`/${workflow.path}`)
    );
}

function workflowRunIdentifierMatches(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return [ undefined, null, workflow.identifier ].includes(run.workflow_id);
}

function workflowRunNameMatches(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return [ undefined, null, workflow.name ].includes(run.name);
}

function workflowRunMatchesIdentity(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow): boolean {
    return (
        workflowRunIdentifierMatches(run, workflow) &&
        workflowRunPathMatches(run, workflow) &&
        workflowRunNameMatches(run, workflow)
    );
}

function workflowRunMatchesInput(run: ReleaseWorkflowRun, workflow: ReleaseWorkflow, headHash: string): boolean {
    return run.head_sha === headHash && run.event === 'workflow_dispatch' && workflowRunMatchesIdentity(run, workflow);
}

export function workflowMatchesIdentifier(workflow: ReleaseWorkflow, identifier: string): boolean {
    return (
        String(workflow.identifier) === identifier ||
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
        return { identifier: workflow.identifier, name: workflow.name, path: workflow.path };
    }
    throw new Error(`GitHub Actions workflow "${identifier}" matched multiple workflows`);
}

export function findWorkflowRunIdentifierInRuns(
    runs: readonly ReleaseWorkflowRun[],
    workflow: ReleaseWorkflow,
    headHash: string
): number | undefined {
    const matchingRunIdentifiers = runs
        .filter(function (workflowRun) {
            return workflowRunMatchesInput(workflowRun, workflow, headHash);
        })
        .map(readWorkflowRunIdentifier)
        .filter(isDefined);
    return matchingRunIdentifiers.length === 0 ? undefined : Math.max(...matchingRunIdentifiers);
}

export function observedWorkflowRunIdentifiers(runs: readonly ReleaseWorkflowRun[]): readonly number[] {
    return runs.map(readWorkflowRunIdentifier).filter(isDefined);
}
