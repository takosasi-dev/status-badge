// 純関数: ノートのパスと読んだ値から、見出し部に出す印(Badge)を決める。obsidian を import しない(D-13)。
// 状態の文字は写すだけ(INV-2)。決めるのは見た目(アイコン・色の系統・class)とメニューの行だけ。
import type { SpecEntry, SpecIndex } from "./spec/parse";
import { S } from "./strings";

export type Tone = "ok" | "partial" | "progress" | "todo" | "stopped" | "other";
export const TONES: Tone[] = ["ok", "partial", "progress", "todo", "stopped", "other"];

export interface StyleRule { value: string; icon: string; tone: Tone; }

/** 表に無い値・読めない値の見た目(§9.3 の最後の行) */
export const OTHER_STYLE: StyleRule = { value: "", icon: "circle-alert", tone: "other" };

/** 説明書の frontmatter から取った値。文字列なら値、それ以外は「読めない値」(FR-1) */
export type ManualValue = { kind: "value"; value: string } | { kind: "unreadable"; raw: string };

export interface Badge {
	icon: string;
	title: string;          // addAction の第2引数(FR-5)
	text: string;           // 状態の文字(FR-15 で添える)。写したまま
	classes: string[];      // sb-tone-* と sb-conflict・sb-stale(§9.7)
	menu: string[];         // 押したときの見出しの行(§9.6 の 1〜5)
	reasonPath: string | null;  // 「根拠のノートを開く」の先(vault の中のノートだけ)
	manualPath?: string;    // 説明書のノートなら、その場所(FR-22 で状態を変える先)
	manualValue?: string;   // 説明書の今の値(読めない値なら無い)
}

/** 比べる前に NFC にそろえる(D-8。iPhone 由来の名前は NFD のことがある) */
export function nfc(s: string): string {
	return s.normalize("NFC");
}

/** path が folders のどれかの配下か。フォルダ `Foo` は `Foo/` の配下だけに効く(§9.2) */
export function inFolders(path: string, folders: string[]): boolean {
	const p = nfc(path);
	return folders.some((f) => {
		const d = nfc(f).replace(/\/+$/, "");
		return d !== "" && p.startsWith(d + "/");
	});
}

/** frontmatter の値を ManualValue にする。プロパティが無ければ null(印を出さない) */
export function manualValueOf(raw: unknown): ManualValue | null {
	if (raw === undefined) return null;
	if (typeof raw === "string") return { kind: "value", value: raw };
	return { kind: "unreadable", raw: JSON.stringify(raw) ?? typeof raw };
}

export function styleFor(value: string, styles: StyleRule[]): StyleRule {
	return styles.find((r) => r.value === value) ?? OTHER_STYLE;
}

export interface ManualSettings {
	showManual: boolean;
	manualFolders: string[];
	manualProperty: string;
	styles: StyleRule[];
}

/** 説明書の印(FR-1・FR-5・FR-6 の説明書分)。対象外・値なしなら null */
export function manualBadge(path: string, value: ManualValue | null, set: ManualSettings): Badge | null {
	if (!set.showManual || value === null || !inFolders(path, set.manualFolders)) return null;
	if (value.kind === "unreadable") {
		return {
			icon: OTHER_STYLE.icon,
			title: S.titleState(value.raw) + S.titleSuffixManual,
			text: value.raw,
			classes: ["sb-tone-other"],
			menu: [S.menuUnreadable(value.raw), S.menuReasonManual(set.manualProperty)],
			reasonPath: null,
			manualPath: path,
		};
	}
	const style = styleFor(value.value, set.styles);
	return {
		icon: style.icon,
		title: S.titleState(value.value) + S.titleSuffixManual,
		text: value.value,
		classes: ["sb-tone-" + style.tone],
		menu: [S.menuState(value.value, S.sourceManual), S.menuReasonManual(set.manualProperty)],
		reasonPath: null,
		manualPath: path,
		manualValue: value.value,
	};
}

// ---- 仕様書(SpecStatus の JSON)の印 -------------------------------------------------

export interface SpecSettings {
	staleDays: number | null;
	styles: StyleRule[];
	missingFolder: string;
	missingExclude: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayNo = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;

/** generated_at(時差つきの ISO 8601)を端末の日時と、今日までの日数にする。時差が無い・読めなければ null(§10) */
export function generatedInfo(iso: string | null, now: Date): { text: string; days: number } | null {
	if (!iso || !/(Z|[+-]\d\d:?\d\d)$/.test(iso)) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const text = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	return { text, days: Math.max(0, dayNo(now) - dayNo(d)) };       // 端末の日付が前なら 0 日
}

/** 根拠の場所が vault の中のノート(vault からの相対の .md)なら、その場所。#L の行番号は外す */
export function notePathOf(path: string): string | null {
	const p = path.split("#L")[0] ?? "";
	if (!p || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/") || !p.toLowerCase().endsWith(".md")) return null;
	return p;
}

/** FR-16: JSON にあるときだけ足す行(値は写すだけ) */
export function extraLines(e: SpecEntry): string[] {
	const x = e.extras;
	const out: string[] = [];
	if (x.waiting && x.waiting !== "なし") out.push(S.menuWaiting(x.waiting));
	if (x.donePhase !== null) out.push(S.menuPhase(x.donePhase, x.lastPhase));
	if (x.ac) out.push(S.menuAc(x.ac.checked, x.ac.total));
	if (x.vulns && x.vulns.count > 0) out.push(S.menuVulns(x.vulns.count, x.vulns.worst, x.vulns.package, x.vulns.fixed));
	if (x.specChanged) out.push(S.menuSpecChanged(x.specChanged));
	if (x.staleDays !== null) out.push(S.menuStale(x.staleDays));
	if (x.github?.release) out.push(S.menuGithub(x.github.release, x.github.ci));
	return out;
}

/** 仕様書の印(FR-3・FR-5〜FR-8・FR-16)。説明書の印もあればメニューに両方を出す(FR-3) */
export function specBadge(e: SpecEntry, index: SpecIndex, set: SpecSettings, now: Date, manual: Badge | null): Badge {
	const gen = generatedInfo(index.generatedAt, now);
	const tail = [S.menuGenerated(gen), ...(e.note ? [S.menuNote(e.note)] : []),
		...(index.unreadableCount ? [S.menuUnreadableCount(index.unreadableCount)] : []), ...extraLines(e),
		...(manual ? manual.menu : [])];
	if (e.duplicate) {
		return { icon: OTHER_STYLE.icon, title: S.titleState(S.duplicate) + S.titleSuffixSpec, text: S.duplicate,
			classes: ["sb-tone-other"], menu: [S.menuDuplicate, ...tail], reasonPath: null };
	}
	if (typeof e.state !== "string" || e.state === "") {
		const raw = JSON.stringify(e.state) ?? typeof e.state;
		return { icon: OTHER_STYLE.icon, title: S.titleState(raw) + S.titleSuffixSpec, text: raw,
			classes: ["sb-tone-other"], menu: [S.menuUnreadable(raw), ...tail], reasonPath: null };
	}
	const style = styleFor(e.state, set.styles);
	const classes = ["sb-tone-" + style.tone];
	let title = S.titleState(e.state) + S.titleSuffixSpec;
	if (e.conflict) {
		classes.push("sb-conflict");
		title += S.titleConflict;
	}
	if (gen && set.staleDays !== null && gen.days > set.staleDays) {
		classes.push("sb-stale");
		title += S.titleStale(gen.days);
	}
	const reason = e.decidedBy ? S.menuReason(e.decidedBy.source, e.decidedBy.value) : S.menuReasonNone;
	const conflicts = e.conflict ? e.conflicts.map((c) => S.menuConflict(c.source, c.value)) : [];
	return {
		icon: style.icon, title, text: e.state, classes,
		menu: [S.menuState(e.state, S.sourceSpec), reason, ...conflicts, ...tail],
		reasonPath: e.decidedBy ? notePathOf(e.decidedBy.path) : null,
		manualPath: manual?.manualPath,
		manualValue: manual?.manualValue,
	};
}

/** FR-9: 設定のフォルダの配下の md で、JSON に無く除外にも当たらない物(既定は切) */
export function missingBadge(path: string, index: SpecIndex | null, set: SpecSettings): Badge | null {
	if (!index || !set.missingFolder || !path.toLowerCase().endsWith(".md") || !inFolders(path, [set.missingFolder])) return null;
	const p = nfc(path);
	if (index.byPath.has(p) || set.missingExclude.some((x) => nfc(x) === p)) return null;
	return { icon: OTHER_STYLE.icon, title: S.titleState(S.missing) + S.titleSuffixSpec, text: S.missing,
		classes: ["sb-tone-other"], menu: [S.menuMissing], reasonPath: null };
}

/** 付け直しが要るかを比べる鍵(D-11。中身が変わったら外して付け直す) */
export function badgeKey(b: Badge, showText: boolean): string {
	return JSON.stringify([b.icon, b.title, b.classes, showText ? b.text : ""]);
}

/** 設定の「値 | アイコン名 | 色の系統」の行を読む。読めない行は errors に入れる */
export function parseStyles(text: string): { rules: StyleRule[]; errors: string[] } {
	const rules: StyleRule[] = [];
	const errors: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (line.trim() === "") continue;
		const parts = line.split("|").map((p) => p.trim());
		const tone = parts[2] as Tone | undefined;
		if (parts.length !== 3 || !parts[0] || !parts[1] || !tone || !TONES.includes(tone)) {
			errors.push(S.errStyleLine(line));
			continue;
		}
		rules.push({ value: parts[0], icon: parts[1], tone });
	}
	return { rules, errors };
}

export function formatStyles(rules: StyleRule[]): string {
	return rules.map((r) => `${r.value} | ${r.icon} | ${r.tone}`).join("\n");
}

/** 本体に無いアイコン名(FR-13)。ids は getIconIds() の結果(`lucide-` の付く書き方も受ける) */
export function missingIcons(rules: StyleRule[], ids: string[]): string[] {
	const have = new Set(ids);
	return [...new Set(rules.map((r) => r.icon))].filter((n) => !have.has(n) && !have.has("lucide-" + n));
}

// ---- 一覧パネル・探す・下の帯・ファイル一覧の点・変化の知らせ(FR-17〜FR-21) ----------------

/** 一覧に並べる1件。仕様書はプロジェクトごと、説明書はノートごと */
export interface Item { name: string; path: string; state: string; waiting: string | null; manual: boolean; }

/** 状態の値を文字にする(文字でなければ JSON の文字。写すだけ) */
export function stateText(v: unknown): string {
	return typeof v === "string" ? v : JSON.stringify(v) ?? typeof v;
}

/** SpecStatus の一覧のプロジェクトを Item にする。文書が無い物は開けないので外す */
export function specItems(index: SpecIndex): Item[] {
	return index.entries.filter((e) => e.docs.length > 0).map((e) => ({
		name: e.name || e.docs[0]!, path: e.docs[0]!, state: stateText(e.state),
		waiting: e.extras.waiting, manual: false,
	}));
}

export interface Group { state: string; style: StyleRule; items: Item[]; }

/** 状態ごとにまとめる。並びは設定の表の順、表に無い値はその後に名前順。中は名前順 */
export function groupItems(items: Item[], styles: StyleRule[]): Group[] {
	const by = new Map<string, Item[]>();
	for (const it of items) by.set(it.state, [...(by.get(it.state) ?? []), it]);
	const order = (v: string) => {
		const i = styles.findIndex((r) => r.value === v);
		return i < 0 ? styles.length : i;
	};
	return [...by.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((state) => ({
		state, style: styleFor(state, styles),
		items: by.get(state)!.sort((a, b) => a.name.localeCompare(b.name)),
	}));
}

/** 待ち(「なし」以外)の種類ごとの件数。多い順 */
export function waitingCounts(items: Item[]): [string, number][] {
	const m = new Map<string, number>();
	for (const it of items) if (it.waiting && it.waiting !== "なし") m.set(it.waiting, (m.get(it.waiting) ?? 0) + 1);
	return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** 前の一覧と今の一覧で状態が変わったプロジェクトの行(FR-21)。増えた・消えた物は出さない */
export function stateChanges(prev: SpecIndex, next: SpecIndex): string[] {
	const key = (e: SpecEntry) => e.name + "\u0000" + (e.docs[0] ?? "");
	const before = new Map(prev.entries.map((e) => [key(e), stateText(e.state)]));
	const out: string[] = [];
	for (const e of next.entries) {
		const was = before.get(key(e));
		const now = stateText(e.state);
		if (was !== undefined && was !== now) out.push(S.changeLine(e.name || e.docs[0] || "?", was, now));
	}
	return out;
}

const TONE_COLOR: Record<Tone, string> = {
	ok: "var(--color-green)", partial: "var(--color-yellow)", progress: "var(--color-blue)",
	todo: "var(--text-muted)", stopped: "var(--color-red)", other: "var(--text-faint)",
};

/** CSS の文字列の中に入れるために \ と " と改行を逃がす */
function cssString(s: string): string {
	return '"' + s.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\a ") + '"';
}

/** ファイル一覧の行(本体の data-path 属性)に色の点を付ける CSS(FR-20)。NFD の名前の vault にも当たるよう両方の形を出す */
export function dotCss(dots: { path: string; tone: Tone }[]): string {
	const byTone = new Map<Tone, string[]>();
	for (const d of dots) {
		const forms = new Set([d.path, d.path.normalize("NFC"), d.path.normalize("NFD")]);
		for (const f of forms) byTone.set(d.tone, [...(byTone.get(d.tone) ?? []), `.nav-file-title[data-path=${cssString(f)}]::after`]);
	}
	return [...byTone.entries()].map(([tone, sels]) => `${sels.join(",\n")} { content: ""; flex: none; align-self: center; `
		+ `width: 7px; height: 7px; margin-inline-start: auto; border-radius: 50%; background-color: ${TONE_COLOR[tone]}; }`).join("\n");
}
