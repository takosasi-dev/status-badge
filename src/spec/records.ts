// 純関数: SpecStatus の記録(data/events/*.jsonl、SpecStatus §9.8)の1行を作る・読む・一覧に重ねる(FR-24・FR-25)。
// obsidian を import しない(D-13)。書くのは main.ts。形と値の制約は SpecStatus の records.validate に合わせる。
import { nfc } from "../resolve";
import { S } from "../strings";
import type { SpecEntry, SpecIndex } from "./parse";

export const RECORDABLE_STATES = ["実装完了", "一部未実装", "着手済", "未着手", "撤退"];
export const WAITINGS = ["なし", "確認待ち", "実物待ち"];
const NOTE_MAX = 200;
const MAX_LINE_BYTES = 4096;

/** 窓で変えた項目だけを持つ(無い項目は書かない)。note の null はメモを消す */
export interface RecordChange { state?: string; donePhase?: number; waiting?: string; note?: string | null; }

const pad = (n: number) => String(n).padStart(2, "0");

/** 秒まで・時差付きの ISO 8601(「2026-10-10T09:05:03+09:00」)。SpecStatus の at の形 */
export function isoLocal(d: Date): string {
	const off = -d.getTimezoneOffset();
	const abs = Math.abs(off);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
		+ `${off >= 0 ? "+" : "-"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** メモを1行にする(改行・タブ・制御文字は空白に)。前後の空白は取る */
export function cleanNote(s: string): string {
	// eslint-disable-next-line no-control-regex -- 制御文字そのものを探す式なので
	return s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

/** 記録ファイルの名前に使える形にする(英数字・-・_ 以外は - に)。空なら null */
export function deviceFileName(name: string): string | null {
	const s = name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
	return s === "" ? null : s;
}

/** 書く前の検査。問題の理由か null(SpecStatus の検査と同じ制約) */
export function checkChange(c: RecordChange, lastPhase: number | null): string | null {
	if (c.state === undefined && c.donePhase === undefined && c.waiting === undefined && c.note === undefined) return S.errNothing;
	if (c.state !== undefined && !RECORDABLE_STATES.includes(c.state)) return S.errValue(c.state);
	if (c.waiting !== undefined && !WAITINGS.includes(c.waiting)) return S.errValue(c.waiting);
	if (c.donePhase !== undefined) {
		if (!Number.isInteger(c.donePhase) || c.donePhase < 0 || c.donePhase > 99) return S.errPhase;
		if (lastPhase !== null && c.donePhase > lastPhase) return S.errPhaseOver(c.donePhase, lastPhase);
	}
	if (typeof c.note === "string") {
		if (c.note === "" || c.note !== cleanNote(c.note)) return S.errValue(c.note);
		if (c.note.length > NOTE_MAX) return S.errNoteLong(c.note.length);
	}
	return null;
}

/** 記録の1行(改行なし)。docPath は一覧の文書のパス(vault から・NFC)。長すぎれば null */
export function recordLine(now: Date, device: string, docPath: string, c: RecordChange): string | null {
	const stem = (docPath.split("/").pop() ?? docPath).replace(/\.md$/i, "");
	const obj: Record<string, unknown> = { v: 1, at: isoLocal(now), pc: device, by: "user", doc: stem, path: docPath };
	if (c.state !== undefined) obj.state = c.state;
	if (c.donePhase !== undefined) obj.done_phase = c.donePhase;
	if (c.waiting !== undefined) obj.waiting = c.waiting;
	if (c.note !== undefined) obj.note = c.note;
	const line = JSON.stringify(obj);
	return new TextEncoder().encode(line).length + 1 > MAX_LINE_BYTES ? null : line;
}

// ---- 読んで重ねる(FR-25) ---------------------------------------------------------------

/** 記録の1行のうち、表示に関わる項目。無い項目は undefined(null は「空に戻す」) */
export interface EventRec {
	at: number;                         // ms
	doc: string;
	path: string;
	state?: string | null;
	donePhase?: number | null;
	lastPhase?: number | null;
	waiting?: string;
	note?: string | null;
}

/** 記録ファイルの中身を読む。読めない行・表示に関わらない行(実装フォルダだけ等)は飛ばす */
export function parseEvents(text: string): EventRec[] {
	const out: EventRec[] = [];
	for (const raw of text.split("\n")) {
		if (raw.trim() === "") continue;
		let o: unknown;
		try {
			o = JSON.parse(raw);
		} catch {
			continue;
		}
		if (o === null || typeof o !== "object" || Array.isArray(o)) continue;
		const r = o as Record<string, unknown>;
		const at = typeof r.at === "string" ? Date.parse(r.at) : NaN;
		if (r.v !== 1 || Number.isNaN(at) || typeof r.doc !== "string" || typeof r.path !== "string") continue;
		const rec: EventRec = { at, doc: r.doc, path: r.path };
		const numOrNull = (v: unknown) => (v === null || (typeof v === "number" && Number.isInteger(v)));
		if (typeof r.state === "string" || r.state === null) rec.state = r.state;
		if (numOrNull(r.done_phase)) rec.donePhase = r.done_phase as number | null;
		if (numOrNull(r.last_phase)) rec.lastPhase = r.last_phase as number | null;
		if (typeof r.waiting === "string") rec.waiting = r.waiting;
		if (typeof r.note === "string" || r.note === null) rec.note = r.note;
		if (rec.state === undefined && rec.donePhase === undefined && rec.lastPhase === undefined
			&& rec.waiting === undefined && rec.note === undefined) continue;
		out.push(rec);
	}
	return out;
}

const stemOf = (path: string) => nfc((path.split("/").pop() ?? path).replace(/\.md$/i, "")).toLowerCase();

/**
 * 一覧(JSON)に畳まれている最後の記録より新しい記録を、古い順に重ねる。重ねた記録の数を返す。
 * 宛先はパス、当たらなければ文書の名前(1つに決まるときだけ)。SpecStatus が一覧を作り直せば、重ねる物は無くなる。
 * 状態を空に戻す記録(null)は、元の証拠の状態が分からないので重ねない(作り直しを待つ)。
 */
export function applyPending(index: SpecIndex, recs: EventRec[]): number {
	let byStem: Map<string, SpecEntry[]> | null = null;
	const find = (rec: EventRec): SpecEntry | null => {
		const hit = index.byPath.get(nfc(rec.path));
		if (hit && !hit.duplicate) return hit;
		if (!byStem) {
			byStem = new Map();
			for (const e of index.entries) {
				for (const d of e.docs) {
					const list = byStem.get(stemOf(d)) ?? [];
					if (!list.includes(e)) list.push(e);
					byStem.set(stemOf(d), list);
				}
			}
		}
		const list = byStem.get(nfc(rec.doc).toLowerCase()) ?? [];
		return list.length === 1 ? list[0]! : null;
	};
	const base = new Map<SpecEntry, number | null>();       // 重ねる前の「最後の記録」の時刻
	let count = 0;
	for (const rec of [...recs].sort((a, b) => a.at - b.at)) {
		const e = find(rec);
		if (!e) continue;
		if (!base.has(e)) base.set(e, e.lastRecordAt);
		const since = base.get(e) ?? null;
		if (since !== null && rec.at <= since) continue;
		if (typeof rec.state === "string") {
			e.state = rec.state;
			e.decidedBy = { source: "events", value: rec.state, path: "" };
		}
		if (rec.donePhase !== undefined) e.extras.donePhase = rec.donePhase;
		if (rec.lastPhase !== undefined && rec.lastPhase !== null) e.extras.lastPhase = rec.lastPhase;
		if (rec.waiting !== undefined) e.extras.waiting = rec.waiting;
		if (rec.note !== undefined) e.note = rec.note;
		e.lastRecordAt = Math.max(e.lastRecordAt ?? 0, rec.at);
		e.pending = true;
		count++;
	}
	return count;
}
