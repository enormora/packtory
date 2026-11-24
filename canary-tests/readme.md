# Canary benchmarks

Each advisory canary measures the candidate’s successful `packtory pack --all` command. `Canary benchmarks` checks that duration against `packBudgetMilliseconds` in [the manifest](canaries.json). The timing still counts if package inspection or comparison later reports a failure. A pack that fails, times out, or never starts is reported as unmeasured.

Each canary checks out and installs the downstream project once. The `buildCommand` runs against its lockfile before the runner copies the prepared tree, so its outputs must work in both workspaces. Keep CLI-specific checks in `verificationCommands`, which run independently with the npm baseline and the source candidate.

The two CLI verification sequences can run concurrently on the same runner. The timed candidate pack runs on its own. Candidate API inspection can overlap the baseline pack.

The benchmark check requires a result from every canary job. Jobs skipped by the path filter publish `skipped`. A missing result indicates a CI failure before the canary could report its outcome.

Calibrate each budget from three successful candidate packs on the Ubuntu CI runner. Add 50% or two seconds to the slowest sample, whichever is greater, and round up to the next second.

The `packtory` and `objectory` budgets are provisional. Their sampled CI packs failed the existing side-effect checks. Recalibrate each budget when successful samples are available.

After `Canary benchmarks` passes on `main`, add it to the `main-integrity` ruleset as a required GitHub Actions check. Keep the individual canary checks advisory.
