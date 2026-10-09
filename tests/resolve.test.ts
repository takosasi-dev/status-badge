// resolve.ts の純関数(説明書の印・見た目の表・アイコン名の確かめ)。合成の値だけを使う(§9.8)。
import { describe, expect, it } from "vitest";
import { badgeKey, inFolders, manualBadge, manualValueOf, missingIcons, parseStyles, formatStyles } from "../src/resolve";
import { DEFAULTS, normalizeSettings } from "../src/settings";

const set = { showManual: true, manualFolders: ["説明書/Claude開発ツールについて"], manualProperty: "状態", styles: DEFAULTS.styles };

describe("説明書の印", () => {
	it("frontmatter の値をそのまま写す(AC-8 の題)", () => {
		const b = manualBadge("説明書/Claude開発ツールについて/VaultDoctor.md", manualValueOf("実装完了"), set);
		expect(b?.title).toBe("状態: 実装完了(説明書)");
		expect(b?.menu[0]).toBe("状態: 実装完了(説明書)");
		expect(b?.icon).toBe("circle-check");
		expect(b?.classes).toEqual(["sb-tone-ok"]);
	});
	it("表に無い値は文字はそのまま・見た目は other(D-10・INV-2)", () => {
		const b = manualBadge("説明書/Claude開発ツールについて/X.md", manualValueOf("独自の値"), set);
		expect(b?.text).toBe("独自の値");
		expect(b?.classes).toEqual(["sb-tone-other"]);
		expect(b?.icon).toBe("circle-alert");
	});
	it("プロパティが無ければ印なし、リストや数は読めない値(FR-1・AC-2 (h))", () => {
		expect(manualBadge("説明書/Claude開発ツールについて/一覧.md", manualValueOf(undefined), set)).toBeNull();
		const b = manualBadge("説明書/Claude開発ツールについて/X.md", manualValueOf(["実装完了"]), set);
		expect(b?.text).toBe('["実装完了"]');
		expect(b?.menu[0]).toBe('読めない値: ["実装完了"]');
		expect(manualBadge("説明書/Claude開発ツールについて/X.md", manualValueOf(null), set)?.classes).toEqual(["sb-tone-other"]);
	});
	it("フォルダの外・設定で切ったときは印なし", () => {
		expect(manualBadge("説明書/ほか/X.md", manualValueOf("実装完了"), set)).toBeNull();
		expect(manualBadge("説明書/Claude開発ツールについてX/A.md", manualValueOf("実装完了"), set)).toBeNull();
		expect(manualBadge("説明書/Claude開発ツールについて/X.md", manualValueOf("実装完了"), { ...set, showManual: false })).toBeNull();
	});
	it("NFD のパスでも NFC のフォルダに当たる(D-8)", () => {
		const nfd = "説明書/Claude開発ツールについて/プラグイン.md".normalize("NFD");
		expect(inFolders(nfd, set.manualFolders)).toBe(true);
	});
	it("中身が同じなら鍵も同じ、文字を添えると変わる(D-11)", () => {
		const b = manualBadge("説明書/Claude開発ツールについて/X.md", manualValueOf("着手済"), set)!;
		expect(badgeKey(b, false)).toBe(badgeKey({ ...b }, false));
		expect(badgeKey(b, true)).not.toBe(badgeKey(b, false));
	});
});

describe("見た目の表とアイコン名", () => {
	it("行を読み書きでき、読めない行は理由を返す", () => {
		const text = formatStyles(DEFAULTS.styles);
		expect(parseStyles(text).rules).toEqual(DEFAULTS.styles);
		const r = parseStyles("実装完了 | circle-check | ok\n壊れた行\n値 | アイコン | 青");
		expect(r.rules).toHaveLength(1);
		expect(r.errors).toHaveLength(2);
	});
	it("本体に無いアイコン名を出す(lucide- の付く書き方も受ける)", () => {
		expect(missingIcons(DEFAULTS.styles, ["lucide-circle-check", "circle-dot", "circle-dashed", "circle", "circle-x"]))
			.toEqual(["circle-help"]);
	});
	it("設定の補い: 欠けた項目は既定、schemaVersion が違えば既定で mismatch", () => {
		expect(normalizeSettings({ showText: true }).settings.showText).toBe(true);
		expect(normalizeSettings({ showText: true }).settings.manualProperty).toBe("状態");
		expect(normalizeSettings({ schemaVersion: 2, showText: true })).toEqual({ settings: DEFAULTS, mismatch: true });
		expect(normalizeSettings({ staleDays: -1 }).settings.staleDays).toBe(7);
		expect(normalizeSettings({ staleDays: null }).settings.staleDays).toBeNull();
	});
});
