// 開いている MarkdownView ごとに、見出し部の印(addAction の要素)を1つ持ち、付ける・付け直す・外す(FR-4・FR-14・D-11)。
// 触る要素は addAction が返した自分の要素だけ(INV-4)。1つのビューで例外が出ても、他のビューは続ける(INV-9)。
import { getIconIds, MarkdownView } from "obsidian";
import { badgeKey, type Badge } from "./resolve";
import { showBadgeMenu } from "./menu";
import type StatusBadgePlugin from "./main";

const FALLBACK_ICON = "circle";       // FR-13: 本体に無いアイコン名のとき

interface Attached { el: HTMLElement; key: string; badge: Badge; }

export class Badges {
	private attached = new Map<MarkdownView, Attached>();

	constructor(private readonly plugin: StatusBadgePlugin) {}

	/** 全ウィンドウの leaf を回って印をそろえる。印を付けたビューの数を返す */
	refresh(): number {
		const ids = new Set(getIconIds());
		const iconOk = (n: string) => ids.has(n) || ids.has("lucide-" + n);
		const showText = this.plugin.settings.showText;
		const seen = new Set<MarkdownView>();
		let count = 0;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) return;     // 裏のタブ(遅延)・Canvas・PDF は付けない(D-12)
			seen.add(view);
			try {
				const badge = this.plugin.badgeFor(view.file);
				const cur = this.attached.get(view);
				if (!badge) {
					this.remove(view);
					return;
				}
				count++;
				const key = badgeKey(badge, showText);
				if (cur && cur.key === key && cur.el.isConnected) {
					cur.badge = badge;
					return;
				}
				this.remove(view);
				const entry: Attached = { el: view.addAction(iconOk(badge.icon) ? badge.icon : FALLBACK_ICON, badge.title,
					(evt) => showBadgeMenu(this.plugin, entry.badge, evt)), key, badge };
				entry.el.addClasses(["sb-badge", ...badge.classes]);
				if (showText) {
					entry.el.addClass("sb-with-text");
					entry.el.createSpan({ cls: "sb-text", text: badge.text });
				}
				this.attached.set(view, entry);
			} catch (e) {
				console.error("StatusBadge: 印を付けられません", view.file?.path, e);
			}
		});
		for (const view of [...this.attached.keys()]) {
			if (!seen.has(view)) this.remove(view);
		}
		return count;
	}

	private remove(view: MarkdownView): void {
		this.attached.get(view)?.el.detach();
		this.attached.delete(view);
	}

	/** プラグインを無効にしたとき。leaf は detach しない(FR-14) */
	detachAll(): void {
		for (const view of [...this.attached.keys()]) this.remove(view);
	}
}
