export type Release = {
  latestVersion: string | undefined;
  candidate: string;
  hasChanges: boolean;
  hasBreakingChanges: boolean;
};

export type Decision = { action: "release" } | { action: "draft" } | { action: "reject"; problems: string[] };

type Version = [major: number, minor: number, patch: number];

function parseVersion(text: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!match) throw new Error(`Invalid version: ${text}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  return x.map((part, i) => part - y[i]!).find((difference) => difference !== 0) ?? 0;
}

export type BumpKind = "major" | "minor" | "patch";

export function bumpKind(from: string, to: string): BumpKind {
  const [a, b] = [parseVersion(from), parseVersion(to)];
  if (a[0] !== b[0]) return "major";
  if (a[1] !== b[1]) return "minor";
  return "patch";
}

function problemsWith({ latestVersion, candidate, hasChanges, hasBreakingChanges }: Release & { latestVersion: string }): string[] {
  if (compareVersions(candidate, latestVersion) < 0) {
    return [`info.version ${candidate} must be greater than the latest release ${latestVersion}.`];
  }
  const problems = [];
  if (bumpKind(latestVersion, candidate) === "patch" && hasChanges) {
    problems.push("A patch release may change only descriptions and examples.");
  }
  const [latestMajor] = parseVersion(latestVersion);
  if (hasBreakingChanges && latestMajor >= 1 && bumpKind(latestVersion, candidate) !== "major") {
    problems.push("Breaking changes require a major release (see ADR 0001).");
  }
  if (hasBreakingChanges && latestMajor === 0 && bumpKind(latestVersion, candidate) === "patch") {
    problems.push("Breaking changes in 0.x require at least a minor release.");
  }
  return problems;
}

export function decideRelease(release: Release): Decision {
  if (release.latestVersion === undefined) return { action: "release" };
  if (release.candidate === release.latestVersion) return { action: "draft" };
  const problems = problemsWith({ ...release, latestVersion: release.latestVersion });
  return problems.length > 0 ? { action: "reject", problems } : { action: "release" };
}
