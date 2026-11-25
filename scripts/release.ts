import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { bumpKind, decideRelease } from "./release-policy.ts";

const CONTRACT = "openapi.yaml";
const OASDIFF = "bin/oasdiff";
const ERROR_LEVEL = 3;

type Change = { level: number };

async function contractVersion(): Promise<string> {
  const document = Bun.YAML.parse(await Bun.file(CONTRACT).text()) as { info?: { version?: unknown } };
  const version = document.info?.version;
  if (typeof version !== "string") throw new Error(`${CONTRACT} has no info.version`);
  return version;
}

async function latestTag(): Promise<string | undefined> {
  const tags = (await $`git tag --list ${"v*"} --sort=-v:refname`.text()).trim();
  return tags ? tags.split("\n")[0] : undefined;
}

async function oasdiffJson(command: string, base: string): Promise<Change[]> {
  return (JSON.parse(await $`${OASDIFF} ${command} ${base} ${CONTRACT} --format json`.text()) as Change[] | null) ?? [];
}

async function setOutput(name: string, value: string): Promise<void> {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function writeNotes(notes: () => Promise<string>): Promise<void> {
  if (process.env.RELEASE_NOTES) await Bun.write(process.env.RELEASE_NOTES, await notes());
}

const candidate = await contractVersion();
const tag = await latestTag();
const latestVersion = tag?.slice(1);

let hasChanges = false;
let hasBreakingChanges = false;
let base = "";
if (tag) {
  base = join(await mkdtemp(join(tmpdir(), "journal-spec-")), "base.yaml");
  await Bun.write(base, await $`git show ${`${tag}:${CONTRACT}`}`.text());
  hasChanges = (await oasdiffJson("changelog", base)).length > 0;
  hasBreakingChanges = (await oasdiffJson("breaking", base)).some((change) => change.level >= ERROR_LEVEL);
}
const describeBreakingChanges = () => $`${OASDIFF} breaking ${base} ${CONTRACT}`.text();

const decision = decideRelease({ latestVersion, candidate, hasChanges, hasBreakingChanges });
await setOutput("version", candidate);
await setOutput("release", String(decision.action === "release"));

switch (decision.action) {
  case "draft":
    if (hasBreakingChanges) console.warn(`Draft has breaking changes since ${tag}:\n${await describeBreakingChanges()}`);
    console.log(`Draft: ${CONTRACT} is still at ${tag}. Bump info.version to release.`);
    break;
  case "reject":
    if (hasBreakingChanges) console.error(await describeBreakingChanges());
    console.error(decision.problems.join("\n"));
    process.exit(1);
  case "release":
    if (!latestVersion) {
      await writeNotes(async () => "First release of the contract.");
      console.log(`No previous release. Release v${candidate}.`);
      break;
    }
    await writeNotes(async () =>
      hasChanges
        ? $`${OASDIFF} changelog ${base} ${CONTRACT} --format markdown`.text()
        : "oasdiff detected no API changes. See the commit history for what changed.",
    );
    console.log(`Release v${candidate} (${bumpKind(latestVersion, candidate)} from ${tag}).`);
}
