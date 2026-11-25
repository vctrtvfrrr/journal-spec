import { describe, expect, it } from "bun:test";
import { decideRelease } from "../scripts/release-policy.ts";

const noChanges = { hasChanges: false, hasBreakingChanges: false };

describe("decideRelease", () => {
  it("releases the first version when nothing was released yet", () => {
    expect(decideRelease({ latestVersion: undefined, candidate: "0.1.0", ...noChanges })).toEqual({
      action: "release",
    });
  });

  it("keeps a push without a version bump as a draft, even with breaking changes", () => {
    const decision = decideRelease({ latestVersion: "1.2.0", candidate: "1.2.0", hasChanges: true, hasBreakingChanges: true });
    expect(decision).toEqual({ action: "draft" });
  });

  it("releases a minor version that adds to the contract", () => {
    const decision = decideRelease({ latestVersion: "1.2.0", candidate: "1.3.0", hasChanges: true, hasBreakingChanges: false });
    expect(decision).toEqual({ action: "release" });
  });

  it("rejects a version that is not greater than the latest release", () => {
    const decision = decideRelease({ latestVersion: "1.2.0", candidate: "1.1.9", ...noChanges });
    expect(decision).toEqual({
      action: "reject",
      problems: ["info.version 1.1.9 must be greater than the latest release 1.2.0."],
    });
  });

  it("releases a patch version that changes only descriptions and examples", () => {
    expect(decideRelease({ latestVersion: "1.2.0", candidate: "1.2.1", ...noChanges })).toEqual({ action: "release" });
  });

  it("rejects a patch version that changes the contract", () => {
    const decision = decideRelease({ latestVersion: "1.2.0", candidate: "1.2.1", hasChanges: true, hasBreakingChanges: false });
    expect(decision).toEqual({
      action: "reject",
      problems: ["A patch release may change only descriptions and examples."],
    });
  });

  it("rejects breaking changes from 1.0.0 on without a major version", () => {
    const decision = decideRelease({ latestVersion: "1.2.0", candidate: "1.3.0", hasChanges: true, hasBreakingChanges: true });
    expect(decision).toEqual({
      action: "reject",
      problems: ["Breaking changes require a major release (see ADR 0001)."],
    });
  });

  it("releases breaking changes in a major version", () => {
    const decision = decideRelease({ latestVersion: "1.2.0", candidate: "2.0.0", hasChanges: true, hasBreakingChanges: true });
    expect(decision).toEqual({ action: "release" });
  });

  it("releases breaking changes in 0.x with a minor version", () => {
    const decision = decideRelease({ latestVersion: "0.1.0", candidate: "0.2.0", hasChanges: true, hasBreakingChanges: true });
    expect(decision).toEqual({ action: "release" });
  });

  it("rejects breaking changes in 0.x with a patch version", () => {
    const decision = decideRelease({ latestVersion: "0.1.0", candidate: "0.1.1", hasChanges: true, hasBreakingChanges: true });
    expect(decision).toEqual({
      action: "reject",
      problems: [
        "A patch release may change only descriptions and examples.",
        "Breaking changes in 0.x require at least a minor release.",
      ],
    });
  });
});
