type NoPublication = { readonly type: 'none'; };
type PublishedToRegistry = { readonly type: 'published'; };
type StagedForApproval = { readonly type: 'staged'; readonly stageId: string; };

export type PublicationOutcome = NoPublication | PublishedToRegistry | StagedForApproval;

export const noPublication: PublicationOutcome = { type: 'none' };
export const publishedToRegistry: PublicationOutcome = { type: 'published' };

export function stagedForApproval(stageId: string): PublicationOutcome {
    return { type: 'staged', stageId };
}
