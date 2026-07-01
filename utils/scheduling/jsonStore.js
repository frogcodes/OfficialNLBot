const fs = require("fs");
const path = require("path");

// One promise-chain per resolved file path acts as an async mutex. Each queued
// task waits for the previous one to settle before running, so concurrent
// load-modify-save operations on the same file can never interleave and clobber
// each other's writes. The map holds one settled promise per file (bounded).
const locks = new Map();

function withFileLock(filePath, task) {
  const key = path.resolve(filePath);
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(() => task());

  // Keep the chain alive regardless of whether this task resolves or rejects,
  // but hand the real result/rejection back to the caller.
  locks.set(
    key,
    run.then(
      () => {},
      () => {},
    ),
  );

  return run;
}

function readJsonFile(filePath, fallback) {
  const resolveFallback = () =>
    typeof fallback === "function" ? fallback() : fallback;

  if (!fs.existsSync(filePath)) {
    return resolveFallback();
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();

  if (!raw) {
    return resolveFallback();
  }

  return JSON.parse(raw);
}

// Write to a unique temp file, then rename over the target. rename() is atomic
// on the same filesystem, so readers never observe a half-written file and a
// crash mid-write leaves the previous good copy intact.
function writeJsonFileAtomic(filePath, data) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // Best-effort cleanup of the temp file if the rename never happened.
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
    throw error;
  }
}

// Serialize a fresh read → mutate → atomic write against a single file. The
// mutator runs synchronously inside the lock and receives the freshly-read
// contents, so callers must never hold a parsed object across an await and then
// hand it in — always mutate what this passes them. Returns the mutator's value.
async function mutateJsonFile(filePath, mutator, fallback) {
  return withFileLock(filePath, () => {
    const data = readJsonFile(filePath, fallback);
    const result = mutator(data);
    writeJsonFileAtomic(filePath, data);
    return result;
  });
}

module.exports = {
  mutateJsonFile,
  readJsonFile,
  withFileLock,
  writeJsonFileAtomic,
};
