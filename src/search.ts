// 状態で探す窓(FR-18)。状態・待ち・名前・パスをつないだ文字であいまいに絞り、選んだノートを開く。
import { FuzzySuggestModal, setIcon, type FuzzyMatch } from "obsidian";
import { styleFor, type Item } from "./resolve";
import { S } from "./strings";
import type StatusBadgePlugin from "./main";

export class StatusSearch extends FuzzySuggestModal<Item> {
	constructor(private readonly plugin: StatusBadgePlugin, private readonly query = "") {
		super(plugin.app);
		this.setPlaceholder(S.searchPlaceholder);
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		if (this.query) {
			this.inputEl.value = this.query;
			this.inputEl.dispatchEvent(new Event("input"));     // 下の帯から開いたときは待ちで絞った所から
		}
	}

	getItems(): Item[] { return this.plugin.items(); }

	getItemText(it: Item): string {
		return [it.state, it.waiting && it.waiting !== "なし" ? it.waiting : "", it.name, it.path].join(" ");
	}

	renderSuggestion(m: FuzzyMatch<Item>, el: HTMLElement): void {
		const it = m.item;
		const style = styleFor(it.state, this.plugin.settings.styles);
		el.addClass("sb-search-item");
		setIcon(el.createSpan({ cls: "sb-search-icon sb-tone-" + style.tone }), style.icon);
		const body = el.createDiv({ cls: "sb-search-body" });
		body.createDiv({ text: it.name });
		const sub = [it.state, it.waiting && it.waiting !== "なし" ? it.waiting : "", it.manual ? S.tagManual : ""].filter(Boolean).join(" · ");
		body.createDiv({ cls: "sb-search-sub", text: sub });
	}

	onChooseItem(it: Item): void {
		void this.plugin.openPath(it.path);
	}
}
