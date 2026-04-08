import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index", "src/cli"],
  declaration: "compatible",
  clean: true,
  rollup: {
    emitCJS: false,
    inlineDependencies: false,
    esbuild: {
      target: "node20",
    },
  },
});
