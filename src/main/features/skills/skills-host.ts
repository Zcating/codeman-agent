
import { app } from "electron";
import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
	loadSkillContent,
	scanSkillsDir,
} from "./lib/skill-loader";
import type { SkillManifest } from "../../../renderer/src/shared/lib/types";


export function getSkillsDir(): string {
	return join(app.getPath("home"), ".agents", "skills");
}

export function getPreinstalledDir(): string {
	return join(getSkillsDir(), ".preinstalled");
}

export function getBundledDir(): string {
	return join(process.resourcesPath, "skills");
}


export async function listSkills(): Promise<SkillManifest[]> {
	return Effect.runPromise(scanSkillsDir(getSkillsDir()));
}

export async function readSkillFile(name: string): Promise<string> {
	return Effect.runPromise(loadSkillContent(getSkillsDir(), name));
}


export async function ensurePreinstalledSkills(): Promise<void> {
	const targetRoot = getPreinstalledDir();
	const bundledRoot = getBundledDir();

	await mkdir(targetRoot, { recursive: true });

	try {
		await access(bundledRoot);
	} catch {
		return;
	}

	const entries = await readdir(bundledRoot, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const sourceFile = join(bundledRoot, entry.name, "SKILL.md");
		const targetDir = join(targetRoot, entry.name);
		const targetFile = join(targetDir, "SKILL.md");

		try {
			await access(targetFile);
			continue;
		} catch {
		}

		await mkdir(targetDir, { recursive: true });
		await copyFile(sourceFile, targetFile);
	}
}
