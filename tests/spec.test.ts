// 仕様書の印(spec/parse.ts と resolve.ts の specBadge)。AC-2 の (a)〜(g) と §10 の端の場合。合成の JSON だけを使う。
import { describe, expect, it } from "vitest";
import { parseSpecJson, type SpecIndex } from "../src/spec/parse";
import { generatedInfo, manualBadge, manualValueOf, missingBadge, notePathOf, specBadge } from "../src/resolve";
import { DEFAULTS } from "../src/settings";

const SPEC = "仕様書MDファイル/OS非依存/Obsidianプラグイン/VaultDoctor/VaultDoctor_プラグイン版_vault健康診断_仕様書.md";
const CLI = "仕様書MDファイル/Windows/Claude・開発ツール/VaultDoctor/VaultDoctor_vault健康診断_仕様書.md";
const NOW = new Date("2026-10-09T20:00:00+09:00");

function json(projects: unknown[], extra: Record<string, unknown> = {}): string {
	return JSON.stringify({ schema: 1, generated_at: "2026-10-09T18:00:00+09:00", projects, unreadable: [], ...extra });
}
function proj(path: string, state: unknown, more: Record<string, unknown> = {}) {
	return { name: "X", docs: [{ path }], state, decided_by: { source: "events", value: String(state), path: "spec-status/data/events/pc.jsonl#L3" },
		evidence: [], conflict: false, conflicts: [], note: null, ...more };
}
function index(text: string): SpecIndex {
	const r = parseSpecJson(text);
	if (!r.ok) throw new Error(r.reason);
	return r.index;
}

describe("JSON の読み取り(FR-2・FR-10)", () => {
	it("(g) schema が 1 でない・構文エラー・projects が無いは読めない", () => {
		expect(parseSpecJson(JSON.stringify({ schema: 2, projects: [] }))).toEqual({ ok: false, reason: "schema が 1 でない(2)" });
		expect(parseSpecJson("{").ok).toBe(false);
		expect(parseSpecJson(JSON.stringify({ schema: 1 }))).toEqual({ ok: false, reason: "projects が無い" });
	});
	it("(d) JSON のパスが NFD でもノートの NFC で当たる", () => {
		const idx = index(json([proj(SPEC.normalize("NFD"), "未着手")]));
		expect(idx.byPath.get(SPEC.normalize("NFC"))).toBeDefined();
	});
	it("同じパスが2つのプロジェクトに出たら選ばない(§10)", () => {
		const idx = index(json([proj(SPEC, "未着手"), proj(SPEC, "実装完了")]));
		const b = specBadge(idx.byPath.get(SPEC)!, idx, DEFAULTS, NOW, null);
		expect(b.text).toBe("一覧に同じパスが2つ");
		expect(b.classes).toEqual(["sb-tone-other"]);
	});
});

describe("仕様書の印(FR-3・FR-5〜FR-8・FR-16)", () => {
	it("(a) パスが一致 → JSON の state と同じ文字", () => {
		const idx = index(json([proj(SPEC, "着手済")]));
		const b = specBadge(idx.byPath.get(SPEC)!, idx, DEFAULTS, NOW, null);
		expect(b.title).toBe("状態: 着手済(SpecStatus)");
		expect(b.menu[0]).toBe("状態: 着手済(SpecStatus)");
		expect(b.menu[1]).toBe("根拠: events = 着手済");
		expect(b.reasonPath).toBeNull();                  // 記録(jsonl)はノートでないので開かない
	});
	it("(b) 表に無い state はそのまま・見た目は other", () => {
		const idx = index(json([proj(SPEC, "独自の値")]));
		const b = specBadge(idx.byPath.get(SPEC)!, idx, DEFAULTS, NOW, null);
		expect(b.text).toBe("独自の値");
		expect(b.classes).toEqual(["sb-tone-other"]);
	});
	it("(c) 説明書 VaultDoctor.md が実装完了でも、JSON に無い仕様書には状態なし", () => {
		const idx = index(json([proj(CLI, "実装完了")]));
		expect(idx.byPath.get(SPEC)).toBeUndefined();
		const set = { showManual: true, manualFolders: DEFAULTS.manualFolders, manualProperty: "状態", styles: DEFAULTS.styles };
		expect(manualBadge(SPEC, manualValueOf("実装完了"), set)).toBeNull();
		expect(missingBadge(SPEC, idx, DEFAULTS)).toBeNull();     // FR-9 は既定で切
	});
	it("(e) conflict が true → 食い違いの印と証拠", () => {
		const idx = index(json([proj(SPEC, "実装完了", { conflict: true, conflicts: [{ source: "tooldeck", value: "一部未実装", path: "" }] })]));
		const b = specBadge(idx.byPath.get(SPEC)!, idx, DEFAULTS, NOW, null);
		expect(b.classes).toContain("sb-conflict");
		expect(b.title).toBe("状態: 実装完了(SpecStatus) / 食い違いあり");
		expect(b.menu).toContain("食い違い: tooldeck = 一部未実装");
	});
	it("(f) staleDays を超えたら古さの印、null なら出ない", () => {
		const old = index(json([proj(SPEC, "実装完了")], { generated_at: "2026-09-29T10:00:00+09:00" }));
		const b = specBadge(old.byPath.get(SPEC)!, old, DEFAULTS, NOW, null);
		expect(b.classes).toContain("sb-stale");
		expect(b.title).toBe("状態: 実装完了(SpecStatus) / 一覧は 10 日前");
		expect(specBadge(old.byPath.get(SPEC)!, old, { ...DEFAULTS, staleDays: null }, NOW, null).classes).not.toContain("sb-stale");
		expect(generatedInfo("2026-10-09T18:00:00", NOW)).toBeNull();                     // 時差が無いと読めない
		expect(generatedInfo("2026-10-10T18:00:00+09:00", NOW)?.days).toBe(0);            // 端末の日付が前なら 0 日
	});
	it("state が文字列でない → 読めない値", () => {
		const idx = index(json([proj(SPEC, ["実装完了"])]));
		const b = specBadge(idx.byPath.get(SPEC)!, idx, DEFAULTS, NOW, null);
		expect(b.menu[0]).toBe('読めない値: ["実装完了"]');
	});
	it("FR-16: JSON の追加の項目を写す。説明書の印があれば両方をメニューに", () => {
		const idx = index(json([proj(SPEC, "一部未実装", { waiting: "確認待ち", done_phase: 2, last_phase: 3, ac: { checked: 3, total: 18 },
			vulns: { count: 2, worst: "高", details: [{ package: "requests", version: "2.19.0", fixed: "2.20.0" }] },
			spec_changed: "2026-10-08", stale_days: 40, github: { release: "v0.1.0", ci: "失敗" } })]));
		const manual = { icon: "circle", title: "", text: "", classes: [], menu: ["状態: 実装完了(説明書)"], reasonPath: null };
		const b = specBadge(idx.byPath.get(SPEC)!, idx, DEFAULTS, NOW, manual);
		expect(b.menu).toEqual(expect.arrayContaining(["待ち: 確認待ち", "Phase: 2/3", "受け入れ基準: 3/18",
			"依存の脆弱性: 2 件(一番重い 高、requests を 2.20.0 に)", "仕様書の更新: 2026-10-08(記録より後)", "止まっている: 40 日",
			"GitHub: v0.1.0 CI 失敗", "状態: 実装完了(説明書)", "一覧の作成: 2026-10-09 18:00(0 日前)"]));
	});
	it("根拠のノートは vault の中の .md だけ開く", () => {
		expect(notePathOf("説明書/Claude開発ツールについて/VaultDoctor.md")).toBe("説明書/Claude開発ツールについて/VaultDoctor.md");
		expect(notePathOf("開発ログ/2026-10-09.md#L12")).toBe("開発ログ/2026-10-09.md");
		expect(notePathOf("D:/MyVault/説明書/A.md")).toBeNull();
		expect(notePathOf("spec-status/data/events/pc.jsonl#L3")).toBeNull();
	});
	it("FR-9: 設定のフォルダで、JSON に無く除外にも当たらない md だけ", () => {
		const idx = index(json([proj(SPEC, "実装完了")]));
		const set = { ...DEFAULTS, missingFolder: "仕様書MDファイル" };
		expect(missingBadge("仕様書MDファイル/A/新しい仕様書.md", idx, set)?.text).toBe("一覧に無い");
		expect(missingBadge(SPEC, idx, set)).toBeNull();
		expect(missingBadge("仕様書MDファイル/00_実装状況.md", idx, set)).toBeNull();
	});
});
