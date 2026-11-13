export type BenchmarkCheck = (name: string, execute: () => Promise<void>) => Promise<void>;

type BenchmarkChecks = {
    readonly check: BenchmarkCheck;
    readonly finish: () => void;
};

export function createBenchmarkChecks(writeLine: (message: string) => void): BenchmarkChecks {
    const failures: Error[] = [];
    return {
        async check(name, execute) {
            try {
                await execute();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                writeLine(`FAIL ${name}: ${message}`);
                failures.push(new Error(`${name}: ${message}`, { cause: error }));
            }
        },
        finish() {
            if (failures.length > 0) {
                throw new AggregateError(failures, `${failures.length} benchmark checks failed`);
            }
        }
    };
}
