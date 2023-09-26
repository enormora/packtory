export default {
	files: ["./source/**/*.test.ts"],
	typescript: {
		rewritePaths: {
			"source/": "target/build/source/",
		},
		compile: false,
	},
};

