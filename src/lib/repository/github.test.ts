import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { c as createTar } from "tar";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquirePublicRepository,
  parseGitHubUrl,
  RepositoryAcquisitionError,
} from "./github";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function scaleproofTemporaryDirectories(): Promise<string[]> {
  return (await readdir(os.tmpdir()))
    .filter((entry) => /^scaleproof-[A-Za-z0-9]{6}$/.test(entry))
    .sort();
}

async function archiveFixture(moduleScopes = 0): Promise<Buffer> {
  const root = await mkdtemp(path.join(os.tmpdir(), "github-test-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "repository"));
  await writeFile(
    path.join(root, "repository", "package.json"),
    '{"name":"fixture"}',
  );
  for (const scope of ["src", "lib"].slice(0, moduleScopes)) {
    await mkdir(path.join(root, "repository", scope));
    await Promise.all(
      ["a.ts", "b.ts", "c.ts"].map((file) =>
        writeFile(
          path.join(root, "repository", scope, file),
          `export const ${file[0]} = true;`,
        ),
      ),
    );
  }
  const archivePath = path.join(root, "repository.tar.gz");
  await createTar(
    { cwd: root, file: archivePath, gzip: true },
    ["repository"],
  );
  return readFile(archivePath);
}

function commitFixture(count = 12): Array<{
  author: { id: number };
  commit: { author: { date: string } };
}> {
  return Array.from({ length: count }, (_, index) => ({
    author: { id: (index % 3) + 1 },
    commit: {
      author: {
        date: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      },
    },
  }));
}

describe("parseGitHubUrl", () => {
  it("accepts only a public GitHub repository root URL", () => {
    expect(parseGitHubUrl("https://github.com/openai/openai-node")).toEqual({
      owner: "openai",
      repository: "openai-node",
    });
    expect(parseGitHubUrl("https://github.com/openai/openai-node.git")).toEqual({
      owner: "openai",
      repository: "openai-node",
    });
  });

  it.each([
    "http://github.com/openai/openai-node",
    "https://github.example.com/openai/openai-node",
    "https://github.com/openai/openai-node/tree/main",
    "https://github.com/openai/openai-node?tab=readme",
    "https://user:pass@github.com/openai/openai-node",
  ])("rejects unsafe or out-of-scope URL %s", (value) => {
    expect(() => parseGitHubUrl(value)).toThrow(RepositoryAcquisitionError);
  });

  it("removes the temporary archive and extraction after success", async () => {
    const archive = await archiveFixture();
    const before = await scaleproofTemporaryDirectories();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ private: false, default_branch: "main" }),
        )
        .mockResolvedValueOnce(new Response(Uint8Array.from(archive)))
        .mockResolvedValueOnce(
          Response.json([], {
            headers: { "x-ratelimit-remaining": "50" },
          }),
        ),
    );

    const snapshot = await acquirePublicRepository(
      "https://github.com/example/repository",
    );

    expect(snapshot.files.map((file) => file.path)).toContain("package.json");
    expect(
      (await scaleproofTemporaryDirectories()).filter(
        (directory) => !before.includes(directory),
      ),
    ).toEqual([]);
  });

  it("removes temporary data after an acquisition failure", async () => {
    const before = await scaleproofTemporaryDirectories();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(
      acquirePublicRepository("https://github.com/example/repository"),
    ).rejects.toMatchObject({ code: "download_failed" });
    expect(
      (await scaleproofTemporaryDirectories()).filter(
        (directory) => !before.includes(directory),
      ),
    ).toEqual([]);
  });

  it("distinguishes rate-limited history without exposing identifiers", async () => {
    const archive = await archiveFixture();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ private: false, default_branch: "main" }),
        )
        .mockResolvedValueOnce(new Response(Uint8Array.from(archive)))
        .mockResolvedValueOnce(
          new Response(null, {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" },
          }),
        ),
    );

    const snapshot = await acquirePublicRepository(
      "https://github.com/example/repository",
    );

    expect(snapshot.history).toMatchObject({
      source: "unavailable",
      availability: "rate_limited",
    });
    expect(JSON.stringify(snapshot.history)).not.toContain("example");
  });

  it("preserves a module-history rate limit after repository history succeeds", async () => {
    const archive = await archiveFixture(1);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ private: false, default_branch: "main" }),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.from(archive)))
      .mockResolvedValueOnce(
        Response.json(commitFixture(), {
          headers: { "x-ratelimit-remaining": "10" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 403,
          headers: { "x-ratelimit-remaining": "0" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await acquirePublicRepository(
      "https://github.com/example/repository",
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(snapshot.history).toMatchObject({
      source: "github_recent_commits",
      availability: "rate_limited",
      modules: [],
    });
    expect(snapshot.history.repository.sampledCommits).toBe(12);
    expect(snapshot.history.note).toContain(
      "rate limits stopped module history after 0 of 1",
    );
  });

  it("updates the module request budget and stops when it is exhausted", async () => {
    const archive = await archiveFixture(2);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ private: false, default_branch: "main" }),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.from(archive)))
      .mockResolvedValueOnce(
        Response.json(commitFixture(), {
          headers: { "x-ratelimit-remaining": "2" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json(commitFixture(), {
          headers: { "x-ratelimit-remaining": "0" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await acquirePublicRepository(
      "https://github.com/example/repository",
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(snapshot.history.availability).toBe("rate_limited");
    expect(snapshot.history.modules).toHaveLength(1);
    expect(snapshot.history.note).toContain(
      "rate limits stopped module history after 1 of 2",
    );
  });
});
