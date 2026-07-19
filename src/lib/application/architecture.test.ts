import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(target)));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

describe("architecture dependency direction", () => {
  it.each([
    [
      "lib/analysis",
      /(?:@\/lib\/ai|\/ai\/|@\/components|\/components\/)/,
    ],
    [
      "lib/repository",
      /(?:@\/components|\/components\/|@\/lib\/analysis|\/analysis\/)/,
    ],
    [
      "components",
      /@\/lib\/(?:analysis|repository|ai|application)(?:\/|["'])/,
    ],
  ])("%s does not import a forbidden higher layer", async (area, forbidden) => {
    const files = await sourceFiles(path.join(process.cwd(), "src", area));
    for (const file of files) {
      expect(await readFile(file, "utf8"), file).not.toMatch(forbidden);
    }
  });

  it("keeps the API transport route free of control and scoring policy", async () => {
    const route = await readFile(
      path.join(process.cwd(), "src/app/api/analyze/route.ts"),
      "utf8",
    );
    expect(route).not.toMatch(/analysis\/(controls|scoring|actions)/);
    expect(route).toContain("analyzeRepository");
  });

  it("keeps domain control packs independent", async () => {
    const directory = path.join(process.cwd(), "src/lib/analysis/controls");
    const files = (await readdir(directory))
      .filter((file) => file.endsWith(".ts") && file !== "shared.ts");
    const packNames = files.map((file) => file.replace(/\.ts$/, ""));

    for (const file of files) {
      const source = await readFile(path.join(directory, file), "utf8");
      for (const otherPack of packNames.filter(
        (name) => `${name}.ts` !== file,
      )) {
        expect(source, `${file} imports ${otherPack}`).not.toMatch(
          new RegExp(`from ["'][^"']*${otherPack}["']`),
        );
      }
    }
  });
});
