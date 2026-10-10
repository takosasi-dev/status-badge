// 純関数: SpecStatus の JSON の文字列 → ノートのパス(NFC)ごとの項目の表(FR-2・§9.5)。obsidian を import しない(D-13)。
// 値は写すだけ(INV-2)。schema が 1 でない・projects が無い・構文エラーは「読めない」とし、理由を返す(FR-10)。
import { nfc } from "../resolve";

export interface SpecEv { source: string; value: string; path: string; }

/** FR-16 の追加の項目(JSON にあるときだけ) */
export interface SpecExtras {
	waiting: string | null;
	donePhase: number | null;
	lastPhase: number | null;
	ac: { checked: number; total: number } | null;
	vulns: { count: number; worst: string | null; package: string | null; version: string | null; fixed: string | null } | null;
	specChanged: string | null;
	staleDays: number | null;
	github: { release: string | null; ci: string | null } | null;
}

export interface SpecEntry {
	name: string;
	state: unknown;                 // 写すだけ。文字列でなければ「読めない値」(§10)
	decidedBy: SpecEv | null;
	conflict: boolean;
	conflicts: SpecEv[];
	note: string | null;
	extras: SpecExtras;
	duplicate: boolean;             // 同じパスが2つのプロジェクトに出た(§10)
	docs: string[];                 // このプロジェクトの文書のパス(NFC。FR-17 の一覧で開く先)
	recordDoc: string | null;       // 記録を結ぶ先の文書(FR-24。種類が「仕様書」の物、無ければ付属でない最初の物)
	lastRecordAt: number | null;    // 一覧に畳まれている最後の記録の時刻(ms)。これより新しい記録を重ねる(FR-25)
	pending: boolean;               // 一覧の作り直し前の記録を重ねた(FR-25)
}

/** SpecStatus の「付属」の文書(README など)。記録の宛先にならない */
const SUPPORT_KIND = "付属";

export interface SpecIndex {
	byPath: Map<string, SpecEntry>;
	entries: SpecEntry[];           // プロジェクトごと(FR-17・FR-21)
	generatedAt: string | null;
	unreadableCount: number;
	projects: number;
}

export type ParseResult = { ok: true; index: SpecIndex } | { ok: false; reason: string };

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
/** 文字でない値も、文字にして写す(オブジェクトは JSON の文字) */
const asText = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : JSON.stringify(v));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);

function ev(v: unknown): SpecEv | null {
	const o = obj(v);
	if (!o) return null;
	return { source: asText(o.source), value: asText(o.value), path: typeof o.path === "string" ? o.path : "" };
}

function extras(p: Record<string, unknown>): SpecExtras {
	const ac = obj(p.ac);
	const v = obj(p.vulns);
	const d0 = v && Array.isArray(v.details) ? obj(v.details[0]) : null;
	const gh = obj(p.github);
	return {
		waiting: str(p.waiting),
		donePhase: num(p.done_phase),
		lastPhase: num(p.last_phase),
		ac: ac && num(ac.checked) !== null && num(ac.total) !== null ? { checked: ac.checked as number, total: ac.total as number } : null,
		vulns: v && num(v.count) !== null ? { count: v.count as number, worst: str(v.worst), package: d0 ? str(d0.package) : null,
			version: d0 ? str(d0.version) : null, fixed: d0 ? str(d0.fixed) : null } : null,
		specChanged: str(p.spec_changed),
		staleDays: num(p.stale_days),
		github: gh ? { release: str(gh.release), ci: str(gh.ci) } : null,
	};
}

export function parseSpecJson(text: string): ParseResult {
	let j: unknown;
	try {
		j = JSON.parse(text);
	} catch (e) {
		return { ok: false, reason: `構文エラー(${e instanceof Error ? e.message : "?"})` };
	}
	const root = obj(j);
	if (!root) return { ok: false, reason: "JSON の形が違う" };
	if (root.schema !== 1) return { ok: false, reason: `schema が 1 でない(${JSON.stringify(root.schema)})` };
	if (!Array.isArray(root.projects)) return { ok: false, reason: "projects が無い" };
	const byPath = new Map<string, SpecEntry>();
	const entries: SpecEntry[] = [];
	for (const raw of root.projects) {
		const p = obj(raw);
		if (!p || !Array.isArray(p.docs)) continue;
		const conflicts = Array.isArray(p.conflicts) ? p.conflicts.map(ev).filter((e): e is SpecEv => e !== null) : [];
		const entry: SpecEntry = {
			name: asText(p.name),
			state: p.state,
			decidedBy: ev(p.decided_by),
			conflict: p.conflict === true,
			conflicts,
			note: str(p.note),
			extras: extras(p),
			duplicate: false,
			docs: [],
			recordDoc: null,
			lastRecordAt: null,
			pending: false,
		};
		const last = obj(p.last_record)?.at;
		const lastMs = typeof last === "string" ? Date.parse(last) : NaN;
		entry.lastRecordAt = Number.isNaN(lastMs) ? null : lastMs;
		entries.push(entry);
		let bestIsSpec = false;
		for (const d of p.docs) {
			const path = obj(d)?.path;
			if (typeof path !== "string") continue;
			const key = nfc(path);
			entry.docs.push(key);
			const kind = obj(d)?.kind;
			if (kind !== SUPPORT_KIND && key.toLowerCase().endsWith(".md") && (entry.recordDoc === null || (kind === "仕様書" && !bestIsSpec))) {
				entry.recordDoc = key;
				bestIsSpec = kind === "仕様書";
			}
			const prev = byPath.get(key);
			byPath.set(key, prev ? { ...prev, duplicate: true } : entry);
		}
	}
	return {
		ok: true,
		index: {
			byPath,
			entries,
			generatedAt: typeof root.generated_at === "string" ? root.generated_at : null,
			unreadableCount: Array.isArray(root.unreadable) ? root.unreadable.length : 0,
			projects: root.projects.length,
		},
	};
}
