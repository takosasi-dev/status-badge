// 設定画面(getSettingDefinitions、1.13.0 以降。D-16)。配列と表は1行に1つの文字にして見せ、保存したら全部の印を付け直す(FR-13)。
// 保存は Plugin.saveData() だけ(INV-1)。
import { App, getIconIds, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import { formatStyles, missingIcons, parseStyles } from "./resolve";
import { S } from "./strings";
import type StatusBadgePlugin from "./main";

const LIST_KEYS = new Set(["manualFolders", "missingExclude"]);

export class StatusBadgeSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly owner: StatusBadgePlugin) {
		super(app, owner);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const missing = missingIcons(this.owner.settings.styles, getIconIds());
		return [
			{ type: "group", heading: S.setHeadingPaths, items: [
				{ name: S.setSpecJson, desc: S.setSpecJsonDesc, control: { type: "text", key: "specJsonPath" } },
				{ name: S.setBoard, desc: S.setBoardDesc, control: { type: "text", key: "boardNotePath" } },
			] },
			{ type: "group", heading: S.setHeadingManual, items: [
				{ name: S.setShowManual, control: { type: "toggle", key: "showManual" } },
				{ name: S.setManualFolders, desc: S.setManualFoldersDesc, control: { type: "textarea", key: "manualFolders", rows: 3 } },
				{ name: S.setManualProperty, control: { type: "text", key: "manualProperty" } },
			] },
			{ type: "group", heading: S.setHeadingLook, items: [
				{ name: S.setShowText, desc: S.setShowTextDesc, control: { type: "toggle", key: "showText" } },
				{ name: S.setStaleDays, desc: S.setStaleDaysDesc, control: { type: "text", key: "staleDays",
					validate: (v: string) => (v.trim() === "" || /^\d+$/.test(v.trim()) ? undefined : S.errStaleDays) } },
				{ name: S.setStyles, desc: missing.length ? S.setStylesDesc + "\n" + S.errIconMissing(missing) : S.setStylesDesc,
					control: { type: "textarea", key: "styles", rows: 8,
						validate: (v: string) => parseStyles(v).errors[0] } },
				{ name: S.setMissingFolder, desc: S.setMissingFolderDesc, control: { type: "text", key: "missingFolder" } },
				{ name: S.setMissingExclude, desc: S.setMissingExcludeDesc, control: { type: "textarea", key: "missingExclude", rows: 3 } },
			] },
		];
	}

	/** 配列や表は1行に1つの文字にして見せる */
	getControlValue(key: string): unknown {
		const s = this.owner.settings as unknown as Record<string, unknown>;
		if (LIST_KEYS.has(key)) return (s[key] as string[]).join("\n");
		if (key === "styles") return formatStyles(this.owner.settings.styles);
		if (key === "staleDays") return this.owner.settings.staleDays === null ? "" : String(this.owner.settings.staleDays);
		return s[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.owner.settings as unknown as Record<string, unknown>;
		if (LIST_KEYS.has(key)) {
			s[key] = String(value).split(/\r?\n/).map((x) => x.trim()).filter((x) => x !== "");
		} else if (key === "styles") {
			const { rules } = parseStyles(String(value));
			if (rules.length) this.owner.settings.styles = rules;
		} else if (key === "staleDays") {
			const t = String(value).trim();
			this.owner.settings.staleDays = t === "" ? null : Number(t);
		} else {
			s[key] = value;
		}
		await this.owner.saveSettings();      // 保存したら読み直して全部の印を付け直す(FR-13)
	}
}
