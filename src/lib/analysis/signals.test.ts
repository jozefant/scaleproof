import { describe, expect, it } from "vitest";

import { p0_9Snapshot } from "./p0-9-fixtures";
import { createRepositoryIndex, importClosure } from "./signals";

describe("TypeScript path aliases", () => {
  it("reads aliases from the base tsconfig when a variant without paths is listed first", () => {
    const index = createRepositoryIndex(
      p0_9Snapshot([
        { path: "tsconfig.build.json", content: '{ "extends": "./tsconfig.json" }\n' },
        {
          path: "tsconfig.json",
          content: '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
        },
        { path: "src/app/page.tsx", content: 'import { util } from "@/lib/util";\n' },
        { path: "src/lib/util.ts", content: "export const util = 1;\n" },
      ]),
    );

    expect(importClosure(index, ["src/app/page.tsx"]).has("src/lib/util.ts")).toBe(true);
  });
});
