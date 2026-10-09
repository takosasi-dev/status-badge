// 設定の型・既定値(D-14: 私の vault のパスはここだけに書く)・読み込みの補い。obsidian を import しない(テストで読む)。
// 読み込みで欠けた項目は既定値で埋め、schemaVersion が違えば data.json を書き換えずに既定で動く(§9.2)。
import { formatStyles, parseStyles, type StyleRule } from "./resolve";

export interface Settings {
	schemaVersion: 1;
	specJsonPath: string;
	boardNotePath: string;
	showManual: boolean;
	manualFolders: string[];
	manualProperty: string;
	staleDays: number | null;
	missingFolder: string;
	missingExclude: string[];
	showText: boolean;
	styles: StyleRule[];
}

export const DEFAULTS: Settings = {
	schemaVersion: 1,
	specJsonPath: "仕様書MDファイル/00_実装状況.json",
	boardNotePath: "仕様書MDファイル/00_実装状況.md",
	showManual: true,
	manualFolders: [],                             // 公開の既定は空(使う人が自分の vault のフォルダを書く)
	manualProperty: "状態",
	staleDays: 7,                                  // §8.6(依頼者: 叩き台どおり、2026-10-09)
	missingFolder: "",
	missingExclude: ["仕様書MDファイル/00_実装状況.md", "仕様書MDファイル/00_OS別の整理について.md",
		"仕様書MDファイル/00_Phase0採取キット.md"],
	showText: true,                                // 依頼者: 文字はあった方がいい(2026-10-09。仕様書の既定 OFF から変更)
	styles: [
		{ value: "実装完了", icon: "circle-check", tone: "ok" },
		{ value: "導入済み", icon: "circle-check", tone: "ok" },
		{ value: "一部未実装", icon: "circle-dot", tone: "partial" },
		{ value: "着手済", icon: "circle-dashed", tone: "progress" },
		{ value: "未着手", icon: "circle", tone: "todo" },
		{ value: "撤退", icon: "circle-x", tone: "stopped" },
		{ value: "証拠なし", icon: "circle-help", tone: "other" },
	],
};

function copyDefaults(): Settings {
	return JSON.parse(JSON.stringify(DEFAULTS)) as Settings;
}

/** data.json の中身を Settings にする。schemaVersion が違えば既定(mismatch=true。呼び手が Notice を出す) */
export function normalizeSettings(raw: unknown): { settings: Settings; mismatch: boolean } {
	const base = copyDefaults();
	if (raw === null || typeof raw !== "object") return { settings: base, mismatch: false };
	const r = raw as Record<string, unknown>;
	if (r.schemaVersion !== undefined && r.schemaVersion !== 1) return { settings: base, mismatch: true };
	const str = (k: keyof Settings) => (typeof r[k] === "string" ? (r[k]) : (base[k] as string));
	const bool = (k: keyof Settings) => (typeof r[k] === "boolean" ? (r[k]) : (base[k] as boolean));
	const list = (k: keyof Settings) => (Array.isArray(r[k]) && (r[k] as unknown[]).every((x) => typeof x === "string")
		? (r[k] as string[]) : (base[k] as string[]));
	const stale = r.staleDays === null || (typeof r.staleDays === "number" && Number.isInteger(r.staleDays) && r.staleDays >= 0)
		? (r.staleDays) : base.staleDays;
	const styles = Array.isArray(r.styles) ? parseStyles(formatStyles(r.styles as StyleRule[])).rules : base.styles;
	return {
		settings: {
			schemaVersion: 1,
			specJsonPath: str("specJsonPath"),
			boardNotePath: str("boardNotePath"),
			showManual: bool("showManual"),
			manualFolders: list("manualFolders"),
			manualProperty: str("manualProperty"),
			staleDays: stale,
			missingFolder: str("missingFolder"),
			missingExclude: list("missingExclude"),
			showText: bool("showText"),
			styles: styles.length ? styles : base.styles,
		},
		mismatch: false,
	};
}
