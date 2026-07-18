import { describe, expect, it } from "vitest";

import { parseGitHubUrl, RepositoryAcquisitionError } from "./github";

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
});
