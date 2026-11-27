# Canary benchmarks

Each advisory canary measures the candidate’s successful `packtory pack --all` command. `Canary benchmarks` checks that duration against `packBudgetMilliseconds` in [the manifest](canaries.json). The timing still counts if package inspection or comparison later reports a failure. A pack that fails, times out, or never starts is reported as unmeasured.

Each canary checks out and installs the downstream project once. The `buildCommand` runs against its lockfile before the runner copies the prepared tree, so its outputs must work in both workspaces. Keep CLI-specific checks in `verificationCommands`, which run independently with the npm baseline and the source candidate.

The two variants run concurrently on the same runner. Each variant verifies, packs, and inspects its own workspace in that order. The benchmark records the candidate pack's wall time, including any overlap with the baseline. With at least four CPU cores available, each variant can inspect two groups of generated packages in parallel on the same runner. Each package still gets its own TypeScript project and import probes.

The npm baseline uses the CLI installed from Packtory's own lockfile. Each variant gets a local `packtory` shim that runs its CLI from the downstream workspace.

The benchmark check requires a result from every canary job. Jobs skipped by the path filter publish `skipped`. A missing result indicates a CI failure before the canary could report its outcome.

Calibrate each budget from three successful candidate packs on the Ubuntu CI runner. Add 50% or two seconds to the slowest sample, whichever is greater, and round up to the next second.

The `packtory` and `objectory` budgets are provisional. Their sampled CI packs failed the existing side-effect checks. Recalibrate each budget when successful samples are available.

After `Canary benchmarks` passes on `main`, add it to the `main-integrity` ruleset as a required GitHub Actions check. Keep the individual canary checks advisory.
