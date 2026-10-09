// 印を押したときのメニュー(FR-6・§9.6)。見出しの行は押せない行、その下に開く・読み直すの操作。
// 開くのは vault の中のノートだけ。説明書なら状態の値を変える項目も出す(FR-22)。メニューは押した場所のウィンドウに出る(showAtMouseEvent)。
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
	const manual = badge.manualPath;
	if (manual) {                                    // FR-22: 説明書なら、表の値に変える項目
		menu.addSeparator();
		for (const value of [...new Set(plugin.settings.styles.map((r) => r.value))]) {
			menu.addItem((item) => item.setTitle(S.menuSetManual(value)).setChecked(value === badge.manualValue)
				.onClick(() => void plugin.setManualState(manual, value)));
		}
	}
	menu.showAtMouseEvent(evt);
}
