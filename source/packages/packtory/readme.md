### packtory

**API Package for packtory**

This package provides an API for the `packtory` tool, enabling programmatic usage. It exposes a single function, `buildAndPublishAll(config, options)`, allowing you to integrate packtory into your custom workflows.

**Installation:**

```bash
npm install packtory
```

**Usage:**

```javascript
import { buildAndPublishAll } from 'packtory';

const config = {
    /* your packtory configuration */
};
const options = { dryRun: true }; // Example options

(async () => {
    const result = await buildAndPublishAll(config, options);
    console.log(result);
})();
```

**Parameters:**

-   **config:** The packtory configuration object.
-   **options:** An options object, currently supporting a `dryRun` boolean.

**Return Value:**

-   A `PublishAllResult` object containing either a list of successful publish results or a partial error if some packages have failed.

**Note:** Refer to the [full documentation](https://github.com/enormora/packtory/blob/main/readme.md) for additional details.
