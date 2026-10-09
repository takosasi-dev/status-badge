// v1.1 の純関数(FR-17〜FR-21・FR-23)
import { describe, expect, it } from "vitest";
import { dotCss, groupItems, specItems, stateChanges, waitingCounts, type Item } from "../src/resolve";
import { DEFAULTS } from "../src/settings";
import { parseSpecJson, type SpecIndex } from "../src/spec/parse";
import { S, useLanguage } from "../src/strings";

const idx = (projects: unknown[]): SpecIndex => {
	const r = parseSpecJson(JSON.stringify({ schema: 1, generated_at: "2026-10-09T10:00:00+09:00", projects }));
	if (!r.ok) throw new Error(r.reason);
	return r.index;
};
const p = (name: string, state: string, waiting = "なし") => ({ name, state, waiting, docs: [{ path: `仕様書MDファイル/${name}.md` }] });

describe("v1.1", () => {
	it("specItems: プロジェクトごとに最初の文書を開く先にする。文書の無い物は外す", () => {
		const items = specItems(idx([p("A", "着手済", "確認待ち"), { name: "B", state: "未着手", docs: [] }]));
		expect(items).toEqual([{ name: "A", path: "仕様書MDファイル/A.md", state: "着手済", waiting: "確認待ち", manual: false }]);
	});
	it("groupItems: 設定の表の順、表に無い値は後ろ", () => {
		const it = (name: string, state: string): Item => ({ name, path: name, state, waiting: null, manual: false });
		const g = groupItems([it("b", "未着手"), it("x", "独自"), it("a", "実装完了"), it("c", "未着手")], DEFAULTS.styles);
		expect(g.map((x) => [x.state, x.items.map((i) => i.name)])).toEqual([["実装完了", ["a"]], ["未着手", ["b", "c"]], ["独自", ["x"]]]);
		expect(g[2]!.style.tone).toBe("other");
	});
	it("waitingCounts: なし は数えない、多い順", () => {
		const items = specItems(idx([p("A", "着手済", "確認待ち"), p("B", "着手済", "実物待ち"), p("C", "着手済", "実物待ち"), p("D", "未着手")]));
		expect(waitingCounts(items)).toEqual([["実物待ち", 2], ["確認待ち", 1]]);
	});
	it("stateChanges: 変わった物だけ。増えた物は出さない", () => {
		const before = idx([p("A", "着手済"), p("B", "未着手")]);
		const after = idx([p("A", "実装完了"), p("B", "未着手"), p("C", "着手済")]);
		expect(stateChanges(before, after)).toEqual(["A: 着手済 → 実装完了"]);
	});
	it("dotCss: 系統ごとに1つの規則、パスの \" は逃がす", () => {
		const css = dotCss([{ path: "a/x.md", tone: "ok" }, { path: 'a/"y".md', tone: "ok" }, { path: "a/z.md", tone: "todo" }]);
		expect(css.split("\n").filter((l) => l.includes("{")).length).toBe(2);
		expect(css).toContain('[data-path="a/\\"y\\".md"]');
		expect(dotCss([])).toBe("");
	});
	it("dotCss: NFD の名前の形も出す", () => {
		const css = dotCss([{ path: "プ.md", tone: "ok" }]);
		expect(css).toContain("プ.md".normalize("NFD"));
		expect(css).toContain("プ.md".normalize("NFC"));
	});
	it("useLanguage: ja 以外は英語、ja で戻る", () => {
		useLanguage("en");
		expect(S.cmdSearch).toBe("Find by status");
		useLanguage("ja");
		expect(S.cmdSearch).toBe("状態で探す");
	});
});
