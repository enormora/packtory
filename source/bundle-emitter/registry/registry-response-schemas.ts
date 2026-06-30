import { z } from 'zod/mini';
import { safeParse } from '../../common/schema-validation.ts';

const packageVersionDetailsSchema = z.object({
    dist: z.object({
        tarball: z.string()
    }),
    gitHead: z.optional(z.string())
});

const abbreviatedPackageResponseSchema = z.object({
    name: z.string(),
    'dist-tags': z.object({
        latest: z.optional(z.string())
    }),
    versions: z.record(z.string(), packageVersionDetailsSchema)
});
const fullPackageResponseSchema = z.object({
    name: z.string(),
    'dist-tags': z.object({
        latest: z.optional(z.string())
    }),
    time: z.optional(z.record(z.string(), z.string())),
    versions: z.record(z.string(), packageVersionDetailsSchema)
});

const oidcExchangeResponseSchema = z.object({
    token: z.string(),
    expires: z.coerce.date()
});

export type AbbreviatedPackageResponse = {
    readonly name: string;
    readonly 'dist-tags': {
        readonly latest?: string | undefined;
    };
    readonly versions: Readonly<
        Record<string, { readonly dist: { readonly tarball: string; }; readonly gitHead?: string | undefined; }>
    >;
};

export type FullPackageResponse = {
    readonly name: string;
    readonly 'dist-tags': {
        readonly latest?: string | undefined;
    };
    readonly time?: Readonly<Record<string, string>> | undefined;
    readonly versions: Readonly<
        Record<string, { readonly dist: { readonly tarball: string; }; readonly gitHead?: string | undefined; }>
    >;
};

type OidcExchangeResponse = {
    readonly token: string;
    readonly expires: Date;
};

type FailedOidcExchangeParseResult = { readonly success: false; readonly issues: readonly string[]; };
type SuccessfulOidcExchangeParseResult = { readonly success: true; readonly data: OidcExchangeResponse; };

export type OidcExchangeParseResult = FailedOidcExchangeParseResult | SuccessfulOidcExchangeParseResult;

function isRecord(response: unknown): response is Readonly<Record<string, unknown>> {
    return typeof response === 'object' && response !== null && !Array.isArray(response);
}

export function parseAbbreviatedPackageResponse(response: unknown): AbbreviatedPackageResponse | undefined {
    const result = abbreviatedPackageResponseSchema.safeParse(response);
    return result.success ? result.data : undefined;
}

export function parseFullPackageResponse(response: unknown): FullPackageResponse | undefined {
    const result = fullPackageResponseSchema.safeParse(response);
    return result.success ? result.data : undefined;
}

export function parseOidcExchangeResponse(response: unknown): OidcExchangeParseResult {
    if (!isRecord(response)) {
        return { success: false, issues: [ 'expected object' ] };
    }
    const result = safeParse(oidcExchangeResponseSchema, response);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, issues: result.error.issues };
}
