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
import { createExternalServiceDiagnostics } from "@/lib/diagnostics/external-service";

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
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
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

    try {
      const snapshot = await acquirePublicRepository(
        "https://github.com/example/repository",
      );

      expect(snapshot.files.map((file) => file.path)).toContain("package.json");
      expect(
        (await scaleproofTemporaryDirectories()).filter(
          (directory) => !before.includes(directory),
        ),
      ).toEqual([]);
      expect(infoLog).toHaveBeenCalledTimes(3);
      expect(errorLog).not.toHaveBeenCalled();
      expect(warningLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
      warningLog.mockRestore();
      infoLog.mockRestore();
    }
  });

  it("uses one correlation ID and terminal event per successful GitHub operation", async () => {
    const archive = await archiveFixture();
    const events: unknown[] = [];
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

    await acquirePublicRepository(
      "https://github.com/example/repository",
      undefined,
      createExternalServiceDiagnostics("test-correlation-id", (event) => {
        events.push(event);
      }),
    );

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        correlationId: "test-correlation-id",
        operation: "repository_metadata",
        outcome: "success",
        retryDecision: "not_needed",
      }),
      expect.objectContaining({
        correlationId: "test-correlation-id",
        operation: "archive_download",
        outcome: "success",
        retryDecision: "not_needed",
      }),
      expect.objectContaining({
        correlationId: "test-correlation-id",
        operation: "commit_history",
        outcome: "success",
        retryDecision: "not_retried",
      }),
    ]));
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

  it.each([
    {
      name: "metadata authentication failure",
      responses: [new Response(null, { status: 401 })],
      operation: "repository_metadata",
      statusClass: "4xx",
      providerErrorCode: "authentication",
    },
    {
      name: "archive service failure",
      responses: [
        Response.json({ private: false, default_branch: "main" }),
        new Response(null, { status: 503 }),
      ],
      operation: "archive_download",
      statusClass: "5xx",
      providerErrorCode: "provider_5xx",
    },
  ])("writes a privacy-safe diagnostic for $name", async ({
    responses,
    operation,
    statusClass,
    providerErrorCode,
  }) => {
    const originalToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "github-private-token";
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(responses[0]).mockResolvedValueOnce(responses[1]));

    try {
      await expect(
        acquirePublicRepository("https://github.com/private-owner/secret-repository"),
      ).rejects.toMatchObject({ code: "download_failed" });

      const events = log.mock.calls.map(([entry]) => JSON.parse(String(entry)));
      const event = events.find((candidate) => candidate.operation === operation);
      expect(event).toMatchObject({
        provider: "github",
        operation,
        attempt: 1,
        outcome: "failure",
        statusClass,
        providerErrorCode,
        retryDecision: "not_retried",
        correlationId: expect.any(String),
      });
      const serialized = JSON.stringify(event);
      for (const denied of [
        "private-owner",
        "secret-repository",
        "github-private-token",
        "Authorization",
        "Bearer",
        "response",
        "body",
      ]) {
        expect(serialized).not.toContain(denied);
      }
      expect(Object.keys(event).sort()).toEqual([
        "attempt",
        "correlationId",
        "durationMs",
        "operation",
        "outcome",
        "provider",
        "providerErrorCode",
        "retryDecision",
        "statusClass",
      ]);
    } finally {
      if (originalToken === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = originalToken;
      }
      log.mockRestore();
    }
  });

  it.each([
    {
      name: "metadata transport failure",
      fetchMock: () => vi.fn().mockRejectedValue(new Error("Bearer github-private-token private-owner")),
      operation: "repository_metadata",
    },
    {
      name: "archive transport failure",
      fetchMock: () => vi
        .fn()
        .mockResolvedValueOnce(Response.json({ private: false, default_branch: "main" }))
        .mockRejectedValueOnce(new Error("Bearer github-private-token secret-repository")),
      operation: "archive_download",
    },
  ])("writes one privacy-safe terminal event for $name", async ({ fetchMock, operation }) => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock());

    try {
      await expect(
        acquirePublicRepository("https://github.com/private-owner/secret-repository"),
      ).rejects.toMatchObject({ code: "download_failed" });
      expect(errorLog).toHaveBeenCalledOnce();

      const event = JSON.parse(String(errorLog.mock.calls[0]?.[0]));
      expect(event).toMatchObject({
        provider: "github",
        operation,
        attempt: 1,
        outcome: "failure",
        statusClass: "none",
        providerErrorCode: "transport_failure",
        retryDecision: "not_retried",
      });
      const serialized = JSON.stringify(event);
      for (const denied of [
        "private-owner",
        "secret-repository",
        "github-private-token",
        "Bearer",
        "response",
        "body",
      ]) {
        expect(serialized).not.toContain(denied);
      }
    } finally {
      errorLog.mockRestore();
      infoLog.mockRestore();
    }
  });

  it("records GitHub cancellation without logging the requested repository", async () => {
    const controller = new AbortController();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      throw controller.signal.reason;
    }));

    try {
      await expect(
        acquirePublicRepository(
          "https://github.com/private-owner/secret-repository",
          controller.signal,
        ),
      ).rejects.toMatchObject({ code: "cancelled" });
      expect(log).toHaveBeenCalledOnce();
      expect(errorLog).not.toHaveBeenCalled();
      expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
        provider: "github",
        operation: "repository_metadata",
        outcome: "cancelled",
        providerErrorCode: "cancelled",
        retryDecision: "cancelled",
      });
      const serialized = String(log.mock.calls[0]?.[0]);
      for (const denied of [
        "private-owner",
        "secret-repository",
        "response",
        "body",
      ]) {
        expect(serialized).not.toContain(denied);
      }
    } finally {
      errorLog.mockRestore();
      log.mockRestore();
      infoLog.mockRestore();
    }
  });

  it("records archive-download cancellation once at warning severity", async () => {
    const controller = new AbortController();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const infoLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ private: false, default_branch: "main" }),
        )
        .mockImplementationOnce(async () => {
          controller.abort();
          throw controller.signal.reason;
        }),
    );

    try {
      await expect(
        acquirePublicRepository(
          "https://github.com/private-owner/secret-repository",
          controller.signal,
        ),
      ).rejects.toMatchObject({ code: "cancelled" });
      expect(warningLog).toHaveBeenCalledOnce();
      expect(errorLog).not.toHaveBeenCalled();
      const event = JSON.parse(String(warningLog.mock.calls[0]?.[0]));
      expect(event).toMatchObject({
        provider: "github",
        operation: "archive_download",
        attempt: 1,
        outcome: "cancelled",
        providerErrorCode: "cancelled",
        retryDecision: "cancelled",
      });
      const serialized = JSON.stringify(event);
      for (const denied of [
        "private-owner",
        "secret-repository",
        "response",
        "body",
      ]) {
        expect(serialized).not.toContain(denied);
      }
    } finally {
      errorLog.mockRestore();
      warningLog.mockRestore();
      infoLog.mockRestore();
    }
  });
});
