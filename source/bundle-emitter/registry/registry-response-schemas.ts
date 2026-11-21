import { z } from 'zod/mini';
import { safeParse } from '../../common/schema-validation.ts';

function packageResponseSchema(includePublicationTimes: boolean): z.ZodMiniType<FullPackageResponse> {
    const metadata = {
        name: z.string(),
        'dist-tags': z.object({
            latest: z.optional(z.string())
        })
    };
    const versions = z.record(
        z.string(),
        z.object({
            dist: z.object({
                tarball: z.string(),
                integrity: z.optional(z.unknown()),
                shasum: z.optional(z.unknown())
            }),
            gitHead: z.optional(z.string())
        })
    );
    return z.object(
        includePublicationTimes
            ? { ...metadata, time: z.optional(z.record(z.string(), z.string())), versions }
            : { ...metadata, versions }
    );
}

export type AbbreviatedPackageResponse = {
    readonly name: string;
    readonly 'dist-tags': {
        readonly latest?: string | undefined;
    };
    readonly versions: Readonly<
        Record<
            string,
            {
                readonly dist: {
                    readonly tarball: string;
                    readonly integrity?: unknown;
                    readonly shasum?: unknown;
                };
                readonly gitHead?: string | undefined;
            }
        >
    >;
};

export type FullPackageResponse = {
    readonly name: string;
    readonly 'dist-tags': {
        readonly latest?: string | undefined;
    };
    readonly time?: Readonly<Record<string, string>> | undefined;
    readonly versions: Readonly<
        Record<
            string,
            {
                readonly dist: {
                    readonly tarball: string;
                    readonly integrity?: unknown;
                    readonly shasum?: unknown;
                };
                readonly gitHead?: string | undefined;
            }
        >
    >;
};

type OpenIdentityConnectExchangeResponse = {
    readonly token: string;
    readonly expires: Date;
};

type FailedOpenIdentityConnectExchangeParseResult = { readonly success: false; readonly issues: readonly string[]; };
type SuccessfulOpenIdentityConnectExchangeParseResult = {
    readonly success: true;
    readonly data: OpenIdentityConnectExchangeResponse;
};

type ExchangeResultByStatus = {
    readonly failed: FailedOpenIdentityConnectExchangeParseResult;
    readonly successful: SuccessfulOpenIdentityConnectExchangeParseResult;
};
export type OpenIdentityConnectExchangeParseResult = ExchangeResultByStatus[keyof ExchangeResultByStatus];

function isRecord(response: unknown): response is Readonly<Record<string, unknown>> {
    return typeof response === 'object' && response !== null && !Array.isArray(response);
}

export function parseAbbreviatedPackageResponse(response: unknown): AbbreviatedPackageResponse | undefined {
    const result = packageResponseSchema(false).safeParse(response);
    return result.success ? result.data : undefined;
}

export function parseFullPackageResponse(response: unknown): FullPackageResponse | undefined {
    const result = packageResponseSchema(true).safeParse(response);
    return result.success ? result.data : undefined;
}

export function parseOpenIdentityConnectExchangeResponse(response: unknown): OpenIdentityConnectExchangeParseResult {
    if (!isRecord(response)) {
        return { success: false, issues: [ 'expected object' ] };
    }
    const schema = z.object({ token: z.string(), expires: z.coerce.date() });
    const result = safeParse(schema, response);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, issues: result.error.issues };
}
