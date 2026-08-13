import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function walkSkillFiles(directory, results = []) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES") {
      return results;
    }
    throw error;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkSkillFiles(absolute, results);
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") results.push(absolute);
  }
  return results;
}

function skillIdFromPath(filePath, rootDirectory) {
  return path.relative(rootDirectory, filePath)
    .replace(/\\/g, "/")
    .replace(/\/SKILL\.md$/, "");
}

function skillNameFromPath(filePath) {
  return path.basename(path.dirname(filePath));
}

async function loadSkillsFromDisk(rootDirectory = path.join(os.homedir(), ".codex")) {
  const files = await walkSkillFiles(rootDirectory, []);
  const skills = await Promise.all(files.map(async (filePath) => {
    const [content, stat] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath),
    ]);
    return {
      id: skillIdFromPath(filePath, rootDirectory),
      name: skillNameFromPath(filePath),
      sourcePath: filePath,
      content,
      updatedAt: Math.round(Number(stat.mtimeMs) || Date.now()),
    };
  }));
  return skills.sort((a, b) => a.name.localeCompare(b.name) || a.sourcePath.localeCompare(b.sourcePath));
}

export { loadSkillsFromDisk };
