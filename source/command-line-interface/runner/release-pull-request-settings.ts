import { z } from 'zod/mini';
import { nonEmptyStringSchema } from '../../config/base-validations.ts';

const githubActionsWorkflowDispatchSchema = z.readonly(
    z.strictObject({
        trigger: z.literal('workflow-dispatch'),
        workflowFile: nonEmptyStringSchema,
        requiredStatusContexts: z.readonly(z.tuple([nonEmptyStringSchema], nonEmptyStringSchema)),
        deleteActionRequiredPullRequestRuns: z.optional(z.boolean())
    })
);

export const releasePullRequestSettingsSchema = z.readonly(
    z.strictObject({
        automationAuthor: z.optional(nonEmptyStringSchema),
        body: z.optional(nonEmptyStringSchema),
        branch: z.optional(nonEmptyStringSchema),
        commitSubject: z.optional(nonEmptyStringSchema),
        defaultBranch: z.optional(nonEmptyStringSchema),
        githubActionsCi: z.optional(githubActionsWorkflowDispatchSchema),
        label: z.optional(nonEmptyStringSchema),
        title: z.optional(nonEmptyStringSchema)
    })
);

export type ReleasePullRequestSettings = z.infer<typeof releasePullRequestSettingsSchema>;
