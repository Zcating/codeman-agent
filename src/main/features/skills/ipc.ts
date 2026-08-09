
import { listSkills, readSkillFile } from "./skills-host";
import { registerEffectHandler } from "../../lib/ipc-handler.js";

export function registerSkillsIpc(): void {
	registerEffectHandler("skillsScan", () => listSkills());
	registerEffectHandler("skillsLoad", (args: { name: string }) => {
		const name = args?.name;
		if (typeof name !== "string" || name.length === 0) {
			throw new Error("skillsLoad: name required");
		}
		return readSkillFile(name);
	});
}
