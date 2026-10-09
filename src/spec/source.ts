// SpecStatus の JSON を読む薄い読み手(FR-2・D-6)。§8.4 で .json が TFile になると確かめたので Vault API(cachedRead)だけで読む。
// 読めなければ前の表を捨てて理由を持つ(古い状態を出し続けない。§10)。書き込みはしない(INV-1)。
import type { App } from "obsidian";
import { nfc } from "../resolve";
import { parseSpecJson, type SpecIndex } from "./parse";

export class SpecSource {
	index: SpecIndex | null = null;
	reason: string | null = null;

	async load(app: App, path: string): Promise<void> {
		const file = app.vault.getFileByPath(nfc(path));
		if (!file) {
			this.index = null;
			this.reason = `一覧が無い(${path})`;
			return;
		}
		const r = parseSpecJson(await app.vault.cachedRead(file));
		this.index = r.ok ? r.index : null;
		this.reason = r.ok ? null : r.reason;
	}
}
