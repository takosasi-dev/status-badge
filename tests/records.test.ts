// 進捗の記録(FR-24)と、一覧より新しい記録を重ねる所(FR-25)
import { describe, expect, it } from "vitest";
import { specBadge } from "../src/resolve";
import { DEFAULTS } from "../src/settings";
import { parseSpecJson, type SpecIndex } from "../src/spec/parse";
import { applyPending, checkChange, cleanNote, deviceFileName, isoLocal, parseEvents, recordLine } from "../src/spec/records";

const SPEC = "仕様書MDファイル/A/A_仕様書.md";
const idx = (projects: unknown[]): SpecIndex => {
	const r = parseSpecJson(JSON.stringify({ schema: 1, generated_at: "2026-10-10T09:00:00+09:00", projects }));
	if (!r.ok) throw new Error(r.reason);
	return r.index;
};
const project = (over: Record<string, unknown> = {}) => ({
	name: "A", state: "着手済", waiting: "なし", done_phase: 1, last_phase: 3, note: "前のメモ",
	last_record: { at: "2026-10-09T12:00:00+09:00", by: "claude-code", pc: "pc" },
	docs: [{ path: "仕様書MDファイル/A/README.md", kind: "付属" }, { path: "仕様書MDファイル/A/A_設計書.md", kind: "設計書" },
		{ path: SPEC, kind: "仕様書" }],
	...over,
});
const line = (at: string, fields: Record<string, unknown>, path = SPEC) =>
	JSON.stringify({ v: 1, at, pc: "obsidian-ios-ab12", by: "user", doc: "A_仕様書", path, ...fields });

describe("進捗の記録", () => {
	it("isoLocal: 秒まで・時差付き(SpecStatus の at の形)", () => {
		expect(isoLocal(new Date(2026, 9, 10, 9, 5, 3))).toMatch(/^2026-10-10T09:05:03[+-]\d{2}:\d{2}$/);
	});
	it("recordLine: 変えた項目だけを書く。doc は拡張子なしの名前、by は user", () => {
		const l = recordLine(new Date(2026, 9, 10, 9, 5, 3), "obsidian-ios-ab12", SPEC, { state: "一部未実装", donePhase: 2, note: null })!;
		const o = JSON.parse(l) as Record<string, unknown>;
		expect(o).toMatchObject({ v: 1, pc: "obsidian-ios-ab12", by: "user", doc: "A_仕様書", path: SPEC, state: "一部未実装", done_phase: 2, note: null });
		expect("waiting" in o).toBe(false);
		expect(l.includes("\n")).toBe(false);
		expect(recordLine(new Date(), "d", SPEC, { note: "あ".repeat(2000) })).toBeNull();       // 4096 バイトを超える
	});
	it("checkChange: 何も変えていない・書けない値・フェーズの範囲・メモの長さ", () => {
		expect(checkChange({}, 3)).toBe("変えた項目がありません");
		expect(checkChange({ state: "証拠なし" }, 3)).toContain("書けない値");
		expect(checkChange({ waiting: "いつか" }, 3)).toContain("書けない値");
		expect(checkChange({ donePhase: 4 }, 3)).toContain("最終フェーズ 3 より大きい");
		expect(checkChange({ donePhase: NaN }, null)).toContain("0〜99");
		expect(checkChange({ note: "あ".repeat(201) }, null)).toContain("200 字まで");
		expect(checkChange({ state: "実装完了", donePhase: 3, waiting: "なし", note: null }, 3)).toBeNull();
	});
	it("cleanNote・deviceFileName", () => {
		expect(cleanNote("  1行目\n2行目\t ")).toBe("1行目 2行目");
		expect(deviceFileName(" 私の iPhone 15 ")).toBe("iPhone-15");
		expect(deviceFileName("日本語")).toBeNull();
	});
	it("parseEvents: 読めない行と、表示に関わらない行(実装フォルダだけ)は飛ばす", () => {
		const text = [line("2026-10-10T10:00:00+09:00", { state: "実装完了" }), "{こわれた行", "",
			line("2026-10-10T10:01:00+09:00", { impl_add: ["L:/x"] }), line("2026-10-10T10:02:00+09:00", { note: null })].join("\n") + "\n";
		const recs = parseEvents(text);
		expect(recs.map((r) => [r.state, r.note])).toEqual([["実装完了", undefined], [undefined, null]]);
	});
	it("parse: 記録の宛先は種類が「仕様書」の文書。付属だけなら null", () => {
		expect(idx([project()]).entries[0]!.recordDoc).toBe(SPEC);
		expect(idx([project({ docs: [{ path: "x/README.md", kind: "付属" }] })]).entries[0]!.recordDoc).toBeNull();
	});
	it("applyPending: 一覧に畳まれた最後の記録より新しい物だけを、古い順に重ねる", () => {
		const index = idx([project()]);
		const n = applyPending(index, parseEvents([
			line("2026-10-09T11:00:00+09:00", { state: "撤退" }),                    // 最後の記録より前 → 重ねない
			line("2026-10-10T10:05:00+09:00", { waiting: "確認待ち", note: null }),
			line("2026-10-10T10:00:00+09:00", { state: "一部未実装", done_phase: 2, waiting: "実物待ち" }),
		].join("\n")));
		const e = index.entries[0]!;
		expect(n).toBe(2);
		expect([e.state, e.extras.donePhase, e.extras.waiting, e.note, e.pending]).toEqual(["一部未実装", 2, "確認待ち", null, true]);
		expect(index.byPath.get(SPEC)).toBe(e);                                    // 文書からも同じ物が見える
		const b = specBadge(e, index, DEFAULTS, new Date(2026, 9, 10), null);
		expect(b.text).toBe("一部未実装");
		expect(b.menu).toContain("記録済み(SpecStatus の一覧はまだ作り直されていません)");
		expect(b.recordPath).toBe(SPEC);
	});
	it("applyPending: 一覧が作り直された後(最後の記録と同じ時刻)は重ねない。パスが違っても名前で当てる", () => {
		const at = "2026-10-10T10:00:00+09:00";
		const built = idx([project({ state: "実装完了", last_record: { at, by: "user", pc: "obsidian-ios-ab12" } })]);
		expect(applyPending(built, parseEvents(line(at, { state: "実装完了" })))).toBe(0);
		expect(built.entries[0]!.pending).toBe(false);
		const moved = idx([project()]);
		expect(applyPending(moved, parseEvents(line(at, { state: "実装完了" }, "昔の場所/A_仕様書.md")))).toBe(1);
		expect(moved.entries[0]!.state).toBe("実装完了");
	});
});
