// 印を押したときのメニュー(FR-6・§9.6)。見出しの行は押せない行、その下に開く・読み直すの操作。
// 開くのは vault の中のノートだけ。メニューは押した場所のウィンドウに出る(showAtMouseEvent)。
import { Menu } from "obsidian";
import type { Badge } from "./resolve";
import { S } from "./strings";
import type StatusBadgePlugin from "./main";

export function showBadgeMenu(plugin: StatusBadgePlugin, badge: Badge, evt: MouseEvent): void {
	const menu = new Menu();
	for (const line of badge.menu) {
		menu.addItem((item) => item.setTitle(line).setIsLabel(true));
	}
	menu.addSeparator();
	if (plugin.app.vault.getFileByPath(plugin.settings.boardNotePath)) {
		menu.addItem((item) => item.setTitle(S.menuOpenBoard).setIcon("table").onClick(() => void plugin.openPath(plugin.settings.boardNotePath)));
	}
	const reason = badge.reasonPath;
	if (reason && plugin.app.vault.getFileByPath(reason)) {
		menu.addItem((item) => item.setTitle(S.menuOpenReason).setIcon("file-search").onClick(() => void plugin.openPath(reason)));
	}
	menu.addItem((item) => item.setTitle(S.menuReload).setIcon("refresh-cw").onClick(() => void plugin.reload(true)));
	menu.showAtMouseEvent(evt);
}
