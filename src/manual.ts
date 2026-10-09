// 説明書の frontmatter の状態の値を取る薄い読み手(FR-1)。metadataCache を読むだけで、ファイルは開かない・書かない。
import type { App, TFile } from "obsidian";
import { manualValueOf, type ManualValue } from "./resolve";

export function readManual(app: App, file: TFile, property: string): ManualValue | null {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return manualValueOf(fm?.[property]);
}
