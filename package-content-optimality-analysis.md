# Package Content Optimality Analysis

## Current Pipeline Model

Packtory resolves each package from configured roots, then links package-local files and bundle dependencies, then runs dead-code elimination across the resolved package set, then checks, then version and manifest generation, then artifact collection.

The configured real packages are `packtory`, `@packtory/github-release-gate`, `@packtory/cli`, and `@packtory/bootstrap-npm-package`. `@packtory/github-release-gate` and `@packtory/cli` bundle `packtory`.

Stage model:

- Resource resolver scans JavaScript roots, declared `.d.ts` roots, promoted declaration companions, static imports, dynamic literal imports, `import.meta.resolve()`, local `.json`, local `.wasm`, generated `package.json`, and opted-in source maps. Code membership is source-relative under `sourcesFolder`; explicit `additionalFiles` are appended after local graph files.
- Linker rewrites direct references to configured bundle dependencies, removes files owned by substituted bundles, and roots declaration companions for non-substituted bundled JavaScript files.
- DCE computes reachable top-level bindings, transforms code files with no detected top-level side effects, prunes pure dead runtime code files and paired maps, and recomputes dependency maps from the transformed surviving code.
- Version manager builds `exports`, `bin`, `imports`, `dependencies`, `peerDependencies`, `sideEffects`, `type`, and the generated `package.json`.
- Artifact collection emits the generated manifest once, all non-generated bundle contents, explicit extra files, vendored entries, and executable bin mode.

## Consumer-Safe Needed-File Contract

The emitted package should contain:

- Public runtime roots, private bin and worker roots, and every runtime file required by surviving code.
- Files needed for package surface, including explicit exports, bins, `imports`, generated `package.json`, and package-owned assets reachable from surviving runtime code.
- Files with known or unknown top-level side effects unless there is proof that removing them cannot change module evaluation.
- Explicit `additionalFiles`, including docs, license files, and intentional assets.
- Typed package surfaces: declared root `.d.ts` files, their declaration graph, and declaration companions needed for typed substitution exports.
- `.d.ts` and `.d.ts.map` only for typed roots or typed substitution surfaces. JS-only packages should not ship physical declaration companions just because they exist beside JS files.
- `.map` files only when `includeSourceMapFiles` is enabled, and only paired with surviving mapped code or declaration files.
- Generated manifest dependency metadata only for surviving external imports, surviving sibling package imports, and explicitly configured bundle dependencies still used by the emitted package surface.

## Findings By Stage

### Resource Resolver

- **Contract-optimal:** Static imports, dynamic literal imports, type imports, `import.meta.resolve()`, local `.json`, local `.wasm`, generated manifest imports, and node built-ins are classified consistently. Unresolved non-builtins fail instead of silently dropping files.
- **Contract-optimal:** Declared type roots scan the `.d.ts` graph. The `typed-root` probe emitted `entry.d.ts` and `types.d.ts`, with `exports["."].types` pointing at `entry.d.ts`.
- **Contract-optimal:** JS-only packages do not ship companion declarations by default. The `js-only-companion` probe emitted `entry.js` and `a.js`, not `a.d.ts`.
- **Conservative justified:** `includeSourceMapFiles: true` keeps maps for every surviving scanned code or declaration file. The `source-maps` probe emitted `entry.js.map` and `live.js.map`, not the unreachable `unreached.js.map`.
- **Contract-optimal:** Reachable static assets are emitted and unreachable static assets are ignored. The `asset-reachable` probe emitted `data.json`, not `unused.json`. Explicit static assets are emitted by intent.
- **Unknown:** Runtime file reads, computed import specifiers, nonliteral `import.meta.resolve()`, and asset extensions other than `.json` or `.wasm` are outside membership tracking. This is a deliberate static contract, but packages relying on those patterns need explicit files.

### Linker

- **Contract-optimal:** Sibling package substitution rewrites import literals and removes provider-owned code from consumers. Typed substitution promotes readable declaration companions only for typed providers.
- **Conservative justified:** Declaration companions for retained non-substituted JS files are rooted so implicit substitution subpaths can be typed.
- **Non-optimal false drop:** Explicit files can be discarded when their source path is also owned by a bundled dependency. Lower-level resolve/link evidence:
  - `packtory`: `LICENSE` present, `readme.md` present, 686 linked files.
  - `@packtory/github-release-gate`: `LICENSE` absent, `readme.md` present, 15 linked files.
  - `@packtory/cli`: `LICENSE` absent, `readme.md` present, 161 linked files.
    The common `LICENSE` is explicit in config, but the linker skips nodes owned by substitution sources before explicit inclusion is preserved. The later `requiredFiles` check can report it, but the package content decision is already wrong.
- **Non-optimal:** Linker import-path rewrites do not update paired source maps. DCE source-map recomposition uses linked code as its original text, so maps with nonempty mappings can become inaccurate when substitution changes literal lengths.

### Dead-Code Elimination

- **Addressed:** Dead import specifiers are repaired during DCE. Runtime imports with no surviving specifiers are preserved as bare imports, stale type-only imports are removed, and module status is preserved with `export {};` when needed.
- **Addressed:** DCE prunes pure runtime code files that have no surviving behavior and are no longer reached by surviving imports. Paired maps are pruned with their removed code file.
- **Addressed:** Dependency metadata is recomputed after DCE. Dead external imports no longer generate stale `dependencies` or `peerDependencies`.
- **Addressed:** Dead sibling dynamic imports no longer manifest stale linked bundle dependencies or substituted source-path records.
- **Conservative justified:** Side-effecting files stay untouched. The `side-effecting-file` probe kept `side.js` and generated `sideEffects: ["./side.js"]`.
- **Addressed:** Non-root side-effecting files are retained even when no public root reaches them, because their module evaluation is not proven removable.

### Manifest Generation

- **Contract-optimal:** `exports` include `import` and `types` entries derived from roots and typed substitution surfaces. Explicit package interfaces and bins use configured package surface.
- **Contract-optimal:** External dependencies are grouped into `dependencies` or `peerDependencies` based on the root `package.json`, with peer winning when a name exists in both.
- **Addressed:** Generated manifests receive DCE-filtered `externalDependencies` and `linkedBundleDependencies`, so dependencies removed from transformed code are omitted.
- **Conservative justified:** User-provided `additionalPackageJsonAttributes.sideEffects` overrides the generated side-effects field. Without user override, `sideEffects` is derived from analyzed code files.
- **Unknown:** `typeScriptIntegrity` is not enabled in `packtory.config.js`, so real publish config does not validate generated manifest exports and declarations through the check path before publish.

### Checks, Reports, And Artifact Collection

- **Contract-optimal:** `uniqueTargetPaths` catches same-package target collisions after linking, and `noDuplicatedFiles` checks duplicate source content across packages with an allowlist.
- **Contract-optimal:** Artifact collection emits generated `package.json` once and skips virtual generated-manifest bundle resources.
- **Non-optimal reporting:** Artifact reports label collection under `outputs.tarball` even for zip and folder builds and do not expose executable mode metadata.
- **Conservative justified:** Explicit `additionalFiles` are intentional and bypass reachability. They are still subject to generated manifest target rejection and code-file target rejection.

## Scenario Matrix

| Scenario                                                              | Result                                                        | Classification                                                         | Evidence                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| Dead binding in file A is the only importer of file B                 | `b.js` pruned                                                 | Addressed                                                              | DCE resource pruning tests                 |
| Dead code is the only importer of an external package                 | External dependency metadata removed                          | Addressed                                                              | DCE dependency metadata tests              |
| Pure file has no surviving bindings after DCE                         | `pure.js` pruned unless it is a root or explicit resource     | Addressed                                                              | DCE resource pruning tests                 |
| DCE-dead sibling import should not seed or manifest bundle dependency | Linked dependency metadata removed                            | Addressed                                                              | DCE dependency metadata tests              |
| Typed root `.d.ts` graph is retained                                  | `entry.d.ts` and `types.d.ts` emitted                         | Contract-optimal                                                       | `typed-root` probe                         |
| JS-only package with companion declarations does not ship them        | `a.d.ts` not emitted                                          | Contract-optimal                                                       | `js-only-companion` probe                  |
| Source maps follow only surviving mapped files when enabled           | Live maps emitted, unreachable map absent                     | Contract-optimal for reachability, unknown for linker rewrite accuracy | `source-maps` probe                        |
| Static asset imports survive only when reachable or explicit          | Reachable and explicit assets emitted, unrelated asset absent | Contract-optimal                                                       | `asset-reachable`, `asset-explicit` probes |
| Side-effecting files stay conservative unless removal is proven safe  | Side-effecting file retained and listed                       | Conservative justified                                                 | `side-effecting-file` probe                |

## Verification Performed

- Ran `npx just compile`: passed.
- Created throwaway fixtures and script under `target/package-content-optimality/measure.ts`.
- Ran `node --experimental-strip-types --enable-source-maps target/package-content-optimality/measure.ts`: passed and wrote `target/package-content-optimality/measurement.json`.
- Ran lower-level resolve/link probes against real configured `packtory` plus `@packtory/github-release-gate` and `packtory` plus `@packtory/cli` to confirm explicit `LICENSE` removal before checks.
- Attempted full real-package `resolveAndLinkAll` probes with and without checks. Both were stopped because they exceeded the useful runtime for this report. The narrower resolve/link probes covered the real-package false drop at the stage where it occurs.
- Full lint, unit, property, type, integration, and mutation checks were not run because this task produced an analysis report and throwaway target probes, not a production code change.

## Prioritized Improvements And Optimization Candidates

1. **Addressed: remove dead import specifiers and repair stale import declarations.**
   - Implemented: DCE removes unreachable imported bindings, converts all-dead runtime imports to bare imports, removes stale type-only imports, and inserts `export {};` when a removed type-only import carried module status.
   - Covered by focused unit tests, source-map recomposition tests, and an integration test that runs Node against emitted ESM after DCE.

2. **Addressed: recompute local, external, and sibling dependency metadata from transformed surviving code.**
   - Implemented: DCE rebuilds `directDependencies`, `externalDependencies`, `linkedBundleDependencies`, and substituted source path maps from surviving static imports, re-exports, dynamic literal imports, and `import.meta.resolve()` calls.
   - Covered by unit tests for dead and surviving local, external, sibling, type-only, runtime bare, disabled-DCE, and `import.meta.resolve()` cases, plus an integration fixture for dead external and sibling imports.

3. **Addressed: prune pure runtime code files after symbol DCE.**
   - Implemented: DCE traverses from public roots, explicit resources, generated manifests, declarations, assets, surviving dependency edges, files with surviving runtime behavior, and side-effecting files. Pure runtime code files outside that retained set are dropped with their paired maps.
   - Covered by unit tests for dead local imports, paired map removal, empty root preservation, surviving bare imports, side-effecting files, and disabled transformations, plus an integration fixture for a dead local import.

4. **Preserve explicit `additionalFiles` across bundle substitution ownership.**
   - Impact: medium correctness impact for real packages. Fixes the missing `LICENSE` in `@packtory/github-release-gate` and `@packtory/cli`.
   - Fix shape: when substitution skips provider-owned nodes, do not skip explicitly included resources from the current package, or key ownership decisions by target role instead of only source path.
   - False-drop risk: low. Explicit files are intentional by contract; collision checks can still reject target conflicts.
   - Proof gaps: add an integration test where a consumer and bundled dependency share the same explicit source file and both require the target.

5. **Update source maps for linker import rewrites.**
   - Impact: medium debugging quality, low byte impact.
   - Fix shape: record linker text edits and compose them into paired maps before or together with DCE recomposition.
   - False-drop risk: low. This should not change file membership.
   - Proof gaps: current substitution fixture maps have empty mappings. Add a nonempty mapping fixture that changes import literal length.

6. **Enable or otherwise cover generated manifest type resolution for real package config.**
   - Impact: medium release safety.
   - Fix shape: enable `typeScriptIntegrity` for configured packages, or add a faster targeted generated-manifest resolution check in publish config.
   - False-drop risk: low. This is a check, not a content optimizer.
   - Proof gaps: measure runtime on the real package set and tune scope if needed.

7. **Improve artifact reporting fields.**
   - Impact: low package content impact, medium diagnostic value.
   - Fix shape: report artifact kind accurately for tarball, zip, and folder outputs, and include executable mode metadata.
   - False-drop risk: low.
   - Proof gaps: add report snapshots for folder, zip, tarball, and bin executability.
