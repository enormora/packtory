import defaultAvaConfig from "./ava.config.js"

export default {
    ...defaultAvaConfig,
	files: ["./integration-tests/**/*.test.ts"],
};

