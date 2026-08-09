
import { ipcMain } from "electron";
import { listSkills, readSkillFile } from "./skills-host";
import { runMain } from "../../runtime.js";

export function registerSkillsIpc(): void {
	ipcMain.handle("skillsScan", () => runMain(listSkills()));
	ipcMain.handle("skillsLoad", async (_event, args: { name: string }) => {
		const name = args?.name;
		if (typeof name !== "string" || name.length === 0) {
			throw new Error("skillsLoad: name required");
		}
		return runMain(readSkillFile(name));
	});
}
