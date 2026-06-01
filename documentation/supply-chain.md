# Supply Chain

packtory's supply-chain trust features harden the path between the
source you build and the tarball your consumers install. This document
is the single canonical reference for those features: what's protecting
you out of the box, what you can opt in to, the configuration surface,
the publish-time errors and how to fix them, and the artifacts every
publish actually produces.

## Overview

packtory protects the **build → publish** segment of the supply chain.
The threat model is an attacker who tries to slip a tampered or
misattributed artifact into the registry — by abusing CI access,
hijacking a maintainer account, mutating a dependency mid-flight, or
sneaking lifecycle scripts into the published manifest. packtory's
defaults raise the cost of those attacks; the opt-in features
(provenance, repository coherence) add cryptographic and structural
guarantees on top.

### Out of scope

- **Malicious source code in your own repo.** Provenance signs _what
  was built_, not _that the source was clean_ — an attacker who
  compromises your repository (xz-utils-style) gets a packtory-signed
  attestation for their payload. Code review is the defense.
- **A compromised build machine.** If the machine running
  `packtory publish` is compromised, the publish is too. Hardening the
  CI runner is your job, not packtory's.
- **Typosquatting and dependency confusion.** packtory does not check
  name similarity or registry precedence; those are registry-side
  concerns.

### Comparison

| Feature                                       | Defends against                                          | Default | Configure                                      |
| --------------------------------------------- | -------------------------------------------------------- | ------- | ---------------------------------------------- |
| [Provenance](#provenance-attestations)        | Account compromise, package misattribution               | off     | `publishSettings.provenance: { type: 'auto' }` |
| [Tarball host pinning](#tarball-host-pinning) | Credential exfiltration via a tampered registry response | on      | always on; not configurable                    |

## Quickstart

The typical configuration for a public package with provenance:

```javascript
publishSettings: {
    access: 'public',
    provenance: { type: 'auto' }
}
```

On GitHub Actions, the workflow needs `id-token: write` — see
[Provenance attestations](#provenance-attestations) for the workflow
snippet, GitLab CI variant, and other CIs.

## Provenance attestations

**Threat:** an attacker with publish credentials uploads a tarball that
was never built from your source repository, or a registry account
compromise lets someone misattribute a package to you.
**Default:** off. Enable explicitly via `publishSettings.provenance`.

[npm provenance](https://docs.npmjs.com/generating-provenance-statements)
binds the published tarball to the source commit and CI run that
produced it. packtory drives the underlying
[sigstore](https://docs.sigstore.dev/) flow: the build environment
signs an in-toto v1 statement carrying the
[SLSA Provenance v1](https://slsa.dev/spec/v1.0/provenance) predicate,
the signature is recorded in the
[Rekor transparency log](https://docs.sigstore.dev/logging/overview/),
and the resulting bundle is uploaded with the tarball so the registry
exposes it on the package page.

### The `access: 'public'` precondition

`provenance` is only valid when `access: 'public'`. The discriminated
union in `publishSettings` enforces this at config-validation time —
combining `access: 'restricted'` with a `provenance` field is rejected
before any network call. The reasoning is registry-side: npmjs.org only
publishes provenance attestations for public packages.

### Auto vs file mode

```javascript
publishSettings: {
    access: 'public',
    provenance: { type: 'auto' }
}
```

`type: 'auto'` lets `libnpmpublish` detect the CI environment and
generate the attestation in-process. Currently supported natively:
**GitHub Actions** and **GitLab CI**.

```javascript
publishSettings: {
    access: 'public',
    provenance: {
        type: 'file',
        path: './build/my-package.sigstore'
    }
}
```

`type: 'file'` consumes a pre-generated sigstore bundle. Use this for
any CI not natively supported by `auto` mode (CircleCI, Jenkins,
BuildKite, self-hosted setups). The bundle must have been signed
against the exact tarball packtory builds; mismatches are rejected with
a clear error before publish.

### GitHub Actions

Grant `id-token: write` on the workflow job that runs
`packtory publish`:

```yaml
jobs:
    publish:
        runs-on: ubuntu-latest
        permissions:
            id-token: write
            contents: read
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 24
            - run: npm ci
            - run: npx packtory publish --no-dry-run
```

### GitLab CI

Declare an
[`id_tokens`](https://docs.gitlab.com/ee/ci/secrets/id_token_authentication.html)
entry with audience `sigstore` exposed as `SIGSTORE_ID_TOKEN`:

```yaml
publish:
    image: node:24
    id_tokens:
        SIGSTORE_ID_TOKEN:
            aud: sigstore
    script:
        - npm ci
        - npx packtory publish --no-dry-run
```

### Other CIs (file mode)

Generate a sigstore bundle with the attestation tooling of your choice
(for example,
[`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)
in a federated GHA job, or `cosign`/`sigstore-js` in a script) and
point packtory at the resulting file via `provenance.path`. The bundle
must be signed against the tarball packtory builds — re-generate it
from the same source tree the publish runs against.

### Verifying as a consumer

Inspect the published metadata with:

```bash
npm view <pkg> --json
```

The `dist.attestations` field exposes the provenance bundle URL and
predicate type for any version published with provenance.

## Tarball host pinning

**Threat:** an attacker who controls the registry response (registry
compromise, MITM through a hostile corporate proxy, a poisoned mirror)
returns a crafted `dist.tarball` URL on a host they own. Packtory's
auto-versioning flow downloads the latest published tarball to compare
it against the new build, and the request carries the configured npm
credentials. Without a host check the bearer or basic auth would be
sent to the attacker.
**Default:** on. Not configurable.

Before downloading a tarball, packtory parses the URL returned by the
registry and rejects the publish if its host does not match the host
of the configured registry (or `registry.npmjs.org` when none is set).
The port is part of the comparison, so a downgrade from `:443` to a
different port is also rejected. The error names both hosts so the
mismatch is immediately diagnosable.

## CLI error reference

### Tarball host

- `Refusing to download tarball from "<host>" because it differs from the configured registry host "<host>". A tampered registry response could redirect the request and exfiltrate publish credentials.`
  — the registry returned a tarball URL on a different host than the
  one configured. Investigate the registry mirror or proxy in between;
  a legitimate registry serves tarballs from its own host.
- `Registry returned an invalid tarball URL: "<value>"` — the registry
  response carried a non-URL `dist.tarball`. Almost always a registry
  bug or a tampered response.

### Provenance, auto mode

- `Provenance auto mode requires GitHub Actions or GitLab CI. Detected CI: <name>. Use provenance: { type: 'file' } for other environments.`
  — your CI is not natively supported by `auto` mode. Either run from
  GitHub Actions / GitLab CI, or switch to
  `provenance: { type: 'file', path }` and pre-generate the bundle.
- `GitHub Actions provenance needs "permissions: id-token: write" on the workflow job.`
  — add `id-token: write` to the workflow job that runs
  `packtory publish`.
- `GitLab CI provenance needs an "id_tokens" entry with audience "sigstore" exposed as SIGSTORE_ID_TOKEN.`
  — declare the OIDC ID token for the job with audience `sigstore`.

### Provenance, file mode

- `Provenance bundle file "<path>" does not exist.` — generate the
  bundle with your CI's attestation tooling before running packtory.
- `Provenance bundle file "<path>" is not a valid sigstore bundle.`
  — the file is corrupted or was not produced by a supported sigstore
  client. Re-generate it from the current build.
- `Provenance bundle at "<path>" was signed against a different tarball than the one packtory built.`
  — the bundle's signed digest does not match the tarball packtory
  built. Re-generate the bundle from the current source so its digest
  matches.

## What packtory produces

These are the artifacts a packtory publish emits, with links to the
specifications that define them. Use these as inputs for your own
compliance mapping (NTIA Minimum Elements, EU CRA Annex I, SLSA, etc.)
— the matching is your obligation, not packtory's claim.

- When provenance is enabled, a **sigstore-signed in-toto v1
  statement** carrying the
  [SLSA Provenance v1 predicate](https://slsa.dev/spec/v1.0/provenance),
  recorded in the
  [Rekor transparency log](https://docs.sigstore.dev/logging/overview/),
  delivered via
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements).
- When `provenance: { type: 'auto' }` is enabled, a coherence guarantee
  that `package.json#repository` matches the CI-detected source
  repository, enforced before signing.
