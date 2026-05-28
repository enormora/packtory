export type PublicationOutcome =
    | { readonly type: 'none' }
    | { readonly type: 'published' }
    | { readonly type: 'staged'; readonly stageId: string };

export const noPublication: PublicationOutcome = { type: 'none' };
export const publishedToRegistry: PublicationOutcome = { type: 'published' };

export function stagedForApproval(stageId: string): PublicationOutcome {
    return { type: 'staged', stageId };
}
