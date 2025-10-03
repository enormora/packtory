### packtory

**API Package for packtory**

This package provides an API for the `packtory` tool, enabling programmatic usage. It exposes two functions:

- `buildAndPublishAll(config, options)` – validates the configuration, builds every package, runs the enabled checks, and (optionally) publishes the results.
- `resolveAndLinkAll(config)` – performs the validation, resolve, link, and checks phases without publishing. This is useful for custom workflows and integration tests that only need the prepared bundles.

**Installation:**

```bash
npm install packtory
```

**Usage:**

```javascript
import { buildAndPublishAll, resolveAndLinkAll } from 'packtory';

const config = {
    /* your packtory configuration */
};
const options = { dryRun: true }; // Example options

(async () => {
    const publishResult = await buildAndPublishAll(config, options);
    console.log(publishResult);

    const resolvedResult = await resolveAndLinkAll(config);
    console.log(resolvedResult);
})();
```

**Parameters:**

- **config:** The packtory configuration object.
- **options:** An options object, currently supporting a `dryRun` boolean (only required for `buildAndPublishAll`).

**Return Values:**

- `buildAndPublishAll` returns a `PublishAllResult` containing either a list of successful publish results or a partial error if some packages failed.
- `resolveAndLinkAll` returns a `ResolveAndLinkAllResult` with either the resolved package information or details about the failure (validation errors, check failures, or partial execution issues).

**Note:** Refer to the [full documentation](https://github.com/enormora/packtory/blob/main/readme.md) for additional details.
