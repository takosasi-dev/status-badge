// StatusBadge の入口: 設定・コマンド・付け直しのきっかけのイベント(FR-11・FR-12)。onLayoutReady で初回、onunload で印を全部外す。
// 仕様書は SpecStatus の JSON、説明書は frontmatter から写す。書き込みは saveData() と、説明書の状態を変えるとき(FR-22)だけ。
// v1.1: 一覧パネル(FR-17)・探す窓(FR-18)・下の帯(FR-19)・ファイル一覧の点(FR-20)・変化の知らせ(FR-21)・英語の画面(FR-23)。
import { getLanguage, Notice, Platform, Plugin, TAbstractFile, TFile } from "obsidian";
import { Badges } from "./badges";
import { Dots } from "./dots";
import { readManual } from "./manual";
import { PANEL_VIEW, StatusPanel } from "./panel";
import { RecordModal } from "./record-modal";
import { inFolders, manualBadge, missingBadge, nfc, specBadge, specItems, stateChanges, stateText, styleFor, waitingCounts,
	type Badge, type Item, type Tone } from "./resolve";
import { StatusSearch } from "./search";
import { normalizeSettings, type Settings } from "./settings";
import { StatusBadgeSettingTab } from "./settings-tab";
import type { SpecEntry } from "./spec/parse";
import { deviceFileName, recordLine, type RecordChange } from "./spec/records";
import { SpecSource } from "./spec/source";
import { S, useLanguage } from "./strings";

/** 変化の知らせに並べる行の上限 */
const MAX_CHANGE_LINES = 8;
/** この端末の名前を置く鍵(App.saveLocalStorage。vault ごと・端末ごとで、同期されない) */
const DEVICE_KEY = "status-badge-device";

export default class StatusBadgePlugin extends Plugin {
	settings!: Settings;
	private badges!: Badges;
	private dots = new Dots();
	private spec = new SpecSource();
	private statusEl: HTMLElement | null = null;
	private frame = 0;
	private dataDirty = false;

	async onload(): Promise<void> {
		useLanguage(getLanguage());
		await this.loadSettings();
		this.badges = new Badges(this);
		this.addSettingTab(new StatusBadgeSettingTab(this.app, this));
		this.registerView(PANEL_VIEW, (leaf) => new StatusPanel(leaf, this));
		this.addCommand({ id: "reload-status", name: S.cmdReload, callback: () => void this.reload(true) });
		this.addCommand({ id: "open-status-board", name: S.cmdOpenBoard, callback: () => void this.openPath(this.settings.boardNotePath) });
		this.addCommand({ id: "open-status-panel", name: S.cmdOpenPanel, callback: () => void this.openPanel() });
		this.addCommand({ id: "find-by-status", name: S.cmdSearch, callback: () => new StatusSearch(this).open() });
		this.addCommand({ id: "record-progress", name: S.cmdRecord, checkCallback: (checking) => {
			const file = this.app.workspace.getActiveFile();
			const entry = file && this.canRecord() ? this.entryFor(file.path) : null;
			if (!entry?.recordDoc) return false;
			if (!checking) new RecordModal(this, entry).open();
			return true;
		} });
		this.addRibbonIcon("list-checks", S.cmdOpenPanel, () => void this.openPanel());
		this.statusEl = this.addStatusBarItem();          // PC だけ(iPhone には下の帯が無い)
		this.statusEl.addClass("mod-clickable");
		this.statusEl.setAttr("title", S.statusBarTitle);
		this.statusEl.addEventListener("click", () => new StatusSearch(this, waitingCounts(this.items())[0]?.[0] ?? "").open());

		const schedule = () => this.schedule(false);
		this.registerEvent(this.app.workspace.on("file-open", schedule));
		this.registerEvent(this.app.workspace.on("active-leaf-change", schedule));
		this.registerEvent(this.app.workspace.on("layout-change", schedule));
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (inFolders(file.path, this.settings.manualFolders)) this.schedule(true);   // 説明書の状態が変わった(AC-10)
		}));
		// SpecStatus が JSON を書き直したら読み直す(FR-11。D-6 で Vault API なので modify が来る)
		const onJson = (file: TAbstractFile, oldPath?: string) => {
			const target = nfc(this.settings.specJsonPath);
			const events = this.eventsDir();
			const isEvent = events !== "" && nfc(file.path).startsWith(events + "/") && file.path.endsWith(".jsonl");   // 記録が足された(FR-25)
			if (nfc(file.path) === target || (oldPath !== undefined && nfc(oldPath) === target) || isEvent) void this.reload(false);
			else if (oldPath !== undefined) this.schedule(true);                       // ほかのノートの名前の変更
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
		this.dots.clear();
	}

	/** 付け直しを1フレームに1回にまとめる(FR-11)。data なら一覧パネル・点・下の帯も描き直す */
	schedule(data: boolean): void {
		this.dataDirty ||= data;
		if (this.frame) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = 0;
			this.badges.refresh();
			if (!this.dataDirty) return;
			this.dataDirty = false;
			this.refreshData();
		});
	}

	/** 一覧パネル・ファイル一覧の点・下の帯をデータに合わせる */
	private refreshData(): void {
		const items = this.items();
		for (const leaf of this.app.workspace.getLeavesOfType(PANEL_VIEW)) {
			if (leaf.view instanceof StatusPanel) leaf.view.render();
		}
		if (this.settings.showDots) this.dots.set(this.dotList());
		else this.dots.clear();
		const counts = waitingCounts(items);
		this.statusEl?.setText(S.statusBar(counts));
		this.statusEl?.toggle(counts.length > 0);
	}

	/** JSON を読み直して全部の印を付け直す。notice なら件数か読めない理由を出す(§9.4・FR-10)。変わった物も知らせる(FR-21) */
	async reload(notice: boolean): Promise<void> {
		const prev = this.spec.index;
		try {
			await this.spec.load(this.app, this.settings.specJsonPath, this.settings.eventsDir);
		} catch (e) {
			this.spec.index = null;
			this.spec.reason = e instanceof Error ? e.message : String(e);
		}
		this.badges.refresh();
		this.refreshData();
		const idx = this.spec.index;
		if (this.settings.notifyChanges && prev && idx) {
			const lines = stateChanges(prev, idx);
			if (lines.length) {
				const shown = lines.slice(0, MAX_CHANGE_LINES);
				if (lines.length > shown.length) shown.push(S.changeMore(lines.length - shown.length));
				new Notice(S.noticeChanged(shown), 10000);
			}
		}
		if (!notice) return;
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

	/** JSON を読めないときの理由(一覧パネルに出す) */
	specReason(): string | null {
		return this.spec.index ? null : this.spec.reason;
	}

	/** 説明書のノートと、読めた状態の値 */
	private manualNotes(): { file: TFile; value: string }[] {
		const s = this.settings;
		if (!s.showManual || !s.manualFolders.length) return [];
		const out: { file: TFile; value: string }[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!inFolders(file.path, s.manualFolders)) continue;
			const v = readManual(this.app, file, s.manualProperty);
			if (v?.kind === "value") out.push({ file, value: v.value });
		}
		return out;
	}

	/** 一覧パネルと探す窓に並べる物: SpecStatus のプロジェクトと、状態のある説明書 */
	items(): Item[] {
		const spec = this.spec.index ? specItems(this.spec.index) : [];
		const manual = this.manualNotes().map(({ file, value }): Item =>
			({ name: file.basename, path: file.path, state: value, waiting: null, manual: true }));
		return [...spec, ...manual];
	}

	/** ファイル一覧の点。仕様書の文書すべてと、一覧に無い説明書(印と同じく仕様書が先) */
	private dotList(): { path: string; tone: Tone }[] {
		const styles = this.settings.styles;
		const out: { path: string; tone: Tone }[] = [];
		const idx = this.spec.index;
		for (const e of idx?.entries ?? []) {
			const tone = e.duplicate ? "other" : styleFor(stateText(e.state), styles).tone;
			for (const path of e.docs) out.push({ path, tone });
		}
		for (const { file, value } of this.manualNotes()) {
			if (!idx?.byPath.has(nfc(file.path))) out.push({ path: file.path, tone: styleFor(value, styles).tone });
		}
		return out;
	}

	/** FR-22: 説明書の frontmatter の状態を value にする。変わると metadataCache の changed で印が付け直る */
	async setManualState(path: string, value: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice(S.noticeSetManualFailed(path));
			return;
		}
		const prop = this.settings.manualProperty;
		try {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm[prop] = value;
			});
		} catch (e) {
			new Notice(S.noticeSetManualFailed(e instanceof Error ? e.message : String(e)));
		}
	}

	// ---- 進捗の記録(FR-24) ----

	/** 記録のフォルダ(NFC・末尾の / なし)。空なら記録しない */
	private eventsDir(): string {
		return nfc(this.settings.eventsDir).trim().replace(/\/+$/, "");
	}

	canRecord(): boolean {
		return this.eventsDir() !== "";
	}

	/** この端末の名前(記録ファイルの名前)。無ければ作って、この端末にだけ覚える */
	deviceName(): string {
		const saved: unknown = this.app.loadLocalStorage(DEVICE_KEY);
		const ok = typeof saved === "string" ? deviceFileName(saved) : null;
		if (ok) return ok;
		const kind = Platform.isIosApp ? "ios" : Platform.isAndroidApp ? "android" : "desktop";
		const name = `obsidian-${kind}-${Math.random().toString(16).slice(2, 6)}`;
		this.app.saveLocalStorage(DEVICE_KEY, name);
		return name;
	}

	setDeviceName(value: string): void {
		const name = deviceFileName(value);
		if (name) this.app.saveLocalStorage(DEVICE_KEY, name);       // 空・使えない名前なら前のまま
	}

	/** そのノートのプロジェクト(一覧に無い・同じパスが2つなら null) */
	entryFor(path: string): SpecEntry | null {
		const e = this.spec.index?.byPath.get(nfc(path));
		return e && !e.duplicate ? e : null;
	}

	openRecord(path: string): void {
		const entry = this.entryFor(path);
		if (!entry?.recordDoc || !this.canRecord()) {
			new Notice(S.noticeNoRecordTarget);
			return;
		}
		new RecordModal(this, entry).open();
	}

	/** SpecStatus の記録に1行足す(この端末用のファイル)。足すと vault の modify で読み直しが走り、印に重なる(FR-25) */
	async writeRecord(entry: SpecEntry, change: RecordChange): Promise<boolean> {
		const device = this.deviceName();
		const line = entry.recordDoc ? recordLine(new Date(), device, entry.recordDoc, change) : null;
		if (!line) {
			new Notice(entry.recordDoc ? S.errLineLong : S.noticeNoRecordTarget);
			return false;
		}
		const path = `${this.eventsDir()}/${device}.jsonl`;
		try {
			const file = this.app.vault.getFileByPath(path);
			// 前の書き込みが改行で終わっていなければ、先に改行を足す(SpecStatus は改行で終わらない末尾を「未完」とする)
			if (file) await this.app.vault.process(file, (data) => (data !== "" && !data.endsWith("\n") ? data + "\n" : data) + line + "\n");
			else await this.app.vault.create(path, line + "\n");
		} catch (e) {
			new Notice(S.noticeRecordFailed(e instanceof Error ? e.message : String(e)));
			return false;
		}
		new Notice(S.noticeRecorded(entry.name));
		return true;
	}

	/** 一覧パネルを右の欄に開く(あれば前に出す) */
	async openPanel(): Promise<void> {
		const ws = this.app.workspace;
		let leaf = ws.getLeavesOfType(PANEL_VIEW)[0] ?? null;
		if (!leaf) {
			leaf = ws.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: PANEL_VIEW, active: true });
		}
		await ws.revealLeaf(leaf);
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
