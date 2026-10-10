// SpecStatus の JSON を読む薄い読み手(FR-2・D-6)。§8.4 で .json が TFile になると確かめたので Vault API(cachedRead)だけで読む。
// 読めなければ前の表を捨てて理由を持つ(古い状態を出し続けない。§10)。
// 記録のフォルダ(*.jsonl)も読み、一覧より新しい記録を重ねる(FR-25)。ここでは書かない。
import { TFile, type App } from "obsidian";
import { nfc } from "../resolve";
import { parseSpecJson, type SpecIndex } from "./parse";
import { applyPending, parseEvents, type EventRec } from "./records";

export class SpecSource {
	index: SpecIndex | null = null;
	reason: string | null = null;

	async load(app: App, path: string, eventsDir: string): Promise<void> {
		const file = app.vault.getFileByPath(nfc(path));
		if (!file) {
			this.index = null;
			this.reason = `一覧が無い(${path})`;
			return;
		}
		const r = parseSpecJson(await app.vault.cachedRead(file));
		this.index = r.ok ? r.index : null;
		this.reason = r.ok ? null : r.reason;
		if (!r.ok) return;
		try {
			applyPending(r.index, await readEvents(app, eventsDir));
		} catch (e) {
			console.error("StatusBadge: 記録を読めません(一覧の状態だけを出します)", e);     // INV-9
		}
	}
}

/** 記録のフォルダの *.jsonl を全部読む。フォルダが無い・空の設定なら [] */
async function readEvents(app: App, eventsDir: string): Promise<EventRec[]> {
	const dir = nfc(eventsDir).replace(/\/+$/, "");
	const folder = dir === "" ? null : app.vault.getFolderByPath(dir);
	const out: EventRec[] = [];
	for (const f of folder?.children ?? []) {
		if (f instanceof TFile && f.extension === "jsonl") out.push(...parseEvents(await app.vault.cachedRead(f)));
	}
	return out;
}
