// StatusBadge の入口: 設定・コマンド2つ・付け直しのきっかけのイベント(FR-11・FR-12)。onLayoutReady で初回、onunload で印を全部外す。
// 状態は写すだけで、書き込みは saveData() の data.json だけ(INV-1)。仕様書は SpecStatus の JSON、説明書は frontmatter から。
import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { Badges } from "./badges";
import { readManual } from "./manual";
import { inFolders, manualBadge, missingBadge, nfc, specBadge, type Badge } from "./resolve";
import { normalizeSettings, type Settings } from "./settings";
import { StatusBadgeSettingTab } from "./settings-tab";
import { SpecSource } from "./spec/source";
import { S } from "./strings";

export default class StatusBadgePlugin extends Plugin {
	settings!: Settings;
	private badges!: Badges;
	private spec = new SpecSource();
	private frame = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.badges = new Badges(this);
		this.addSettingTab(new StatusBadgeSettingTab(this.app, this));
		this.addCommand({ id: "reload-status", name: S.cmdReload, callback: () => void this.reload(true) });
		this.addCommand({ id: "open-status-board", name: S.cmdOpenBoard, callback: () => void this.openPath(this.settings.boardNotePath) });

		const schedule = () => this.schedule();
		this.registerEvent(this.app.workspace.on("file-open", schedule));
		this.registerEvent(this.app.workspace.on("active-leaf-change", schedule));
		this.registerEvent(this.app.workspace.on("layout-change", schedule));
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (inFolders(file.path, this.settings.manualFolders)) schedule();      // 説明書の状態が変わった(AC-10)
		}));
		// SpecStatus が JSON を書き直したら読み直す(FR-11。D-6 で Vault API なので modify が来る)
		const onJson = (file: TAbstractFile, oldPath?: string) => {
			const target = nfc(this.settings.specJsonPath);
			if (nfc(file.path) === target || (oldPath !== undefined && nfc(oldPath) === target)) void this.reload(false);
			else if (oldPath !== undefined) schedule();                              // ほかのノートの名前の変更
		};
		this.registerEvent(this.app.vault.on("modify", (f) => onJson(f)));
		this.registerEvent(this.app.vault.on("create", (f) => onJson(f)));
		this.registerEvent(this.app.vault.on("delete", (f) => onJson(f)));
		this.registerEvent(this.app.vault.on("rename", (f, old) => onJson(f, old)));
		this.app.workspace.onLayoutReady(() => void this.reload(false));
	}

	onunload(): void {
		if (this.frame) window.cancelAnimationFrame(this.frame);
		this.badges?.detachAll();
	}

	/** 付け直しを1フレームに1回にまとめる(FR-11) */
	schedule(): void {
		if (this.frame) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = 0;
			this.badges.refresh();
		});
	}

	/** JSON を読み直して全部の印を付け直す。notice なら件数か読めない理由を出す(§9.4・FR-10) */
	async reload(notice: boolean): Promise<void> {
		try {
			await this.spec.load(this.app, this.settings.specJsonPath);
		} catch (e) {
			this.spec.index = null;
			this.spec.reason = e instanceof Error ? e.message : String(e);
		}
		this.badges.refresh();
		if (!notice) return;
		const idx = this.spec.index;
		new Notice(idx ? S.noticeSpecLoaded(idx.projects, idx.byPath.size) : S.noticeSpecUnreadable(this.spec.reason ?? "?"));
	}

	/** そのノートに出す印。仕様書(JSON に当たる)を先に、無ければ説明書、無ければ「一覧に無い」(FR-3・FR-9) */
	badgeFor(file: TFile): Badge | null {
		const s = this.settings;
		const manual = s.showManual && inFolders(file.path, s.manualFolders)
			? manualBadge(file.path, readManual(this.app, file, s.manualProperty), s) : null;
		const idx = this.spec.index;
		const entry = idx?.byPath.get(nfc(file.path));
		if (idx && entry) return specBadge(entry, idx, s, new Date(), manual);
		return manual ?? missingBadge(file.path, idx, s);
	}

	async openPath(path: string): Promise<void> {
		const file = this.app.vault.getFileByPath(nfc(path));
		if (!file) {
			new Notice(S.noticeNoBoard(path));
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	async loadSettings(): Promise<void> {
		const { settings, mismatch } = normalizeSettings(await this.loadData());
		this.settings = settings;
		if (mismatch) new Notice(S.noticeSchema);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		await this.reload(false);
	}
}
