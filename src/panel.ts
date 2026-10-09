// 状態の一覧パネル(FR-17)。右の欄のビューに、状態ごとに畳める組で仕様書と説明書を並べ、押すとノートを開く。
// 要素は自分の contentEl の中に createEl で作るだけ(INV-8)。データが変わったら plugin が render() を呼ぶ。
import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import { groupItems } from "./resolve";
import { S } from "./strings";
import type StatusBadgePlugin from "./main";

export const PANEL_VIEW = "status-badge-panel";

/** 最初から畳んでおく色の系統(済んだ物・やめた物) */
const FOLDED_TONES = new Set(["ok", "stopped"]);

export class StatusPanel extends ItemView {
	private expanded = new Map<string, boolean>();  // 開け閉めを描き直しても保つ(open は View の内部の名前なので使わない)

	constructor(leaf: WorkspaceLeaf, private readonly plugin: StatusBadgePlugin) {
		super(leaf);
	}

	getViewType(): string { return PANEL_VIEW; }
	getDisplayText(): string { return S.panelTitle; }
	getIcon(): string { return "list-checks"; }

	async onOpen(): Promise<void> {
		this.render();
	}

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("sb-panel");
		const reason = this.plugin.specReason();
		if (reason) root.createDiv({ cls: "sb-panel-note", text: S.panelUnreadable(reason) });
		const items = this.plugin.items();
		if (!items.length) {
			root.createDiv({ cls: "sb-panel-note", text: S.panelEmpty });
			return;
		}
		for (const g of groupItems(items, this.plugin.settings.styles)) {
			const det = root.createEl("details", { cls: "sb-panel-group sb-tone-" + g.style.tone });
			det.open = this.expanded.get(g.state) ?? !FOLDED_TONES.has(g.style.tone);
			det.addEventListener("toggle", () => this.expanded.set(g.state, det.open));
			const sum = det.createEl("summary");
			setIcon(sum.createSpan({ cls: "sb-panel-icon" }), g.style.icon);
			sum.createSpan({ text: g.state });
			sum.createSpan({ cls: "sb-panel-count", text: String(g.items.length) });
			for (const it of g.items) {
				const row = det.createDiv({ cls: "sb-panel-item", attr: { title: it.path } });
				row.createSpan({ cls: "sb-panel-name", text: it.name });
				if (it.manual) row.createSpan({ cls: "sb-panel-tag", text: S.tagManual });
				if (it.waiting && it.waiting !== "なし") row.createSpan({ cls: "sb-panel-tag sb-panel-wait", text: it.waiting });
				row.addEventListener("click", () => void this.plugin.openPath(it.path));
			}
		}
	}
}
