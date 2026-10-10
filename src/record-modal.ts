// 進捗を記録する窓(FR-24)。状態・終えたフェーズ・待ち・メモのうち、変えた項目だけを SpecStatus の記録に1行足す。
// 書くのは plugin.writeRecord。ここは入力を集めて検査するだけ。
import { Modal, Notice, Setting, type TextComponent } from "obsidian";
import { stateText } from "./resolve";
import type { SpecEntry } from "./spec/parse";
import { checkChange, cleanNote, RECORDABLE_STATES, WAITINGS, type RecordChange } from "./spec/records";
import { S } from "./strings";
import type StatusBadgePlugin from "./main";

export class RecordModal extends Modal {
	constructor(private readonly plugin: StatusBadgePlugin, private readonly entry: SpecEntry) {
		super(plugin.app);
	}

	onOpen(): void {
		const e = this.entry;
		const x = e.extras;
		const nowState = stateText(e.state);
		const nowWaiting = x.waiting ?? WAITINGS[0]!;
		let state = "";
		let waiting = "";
		let done = "";
		let note = e.note ?? "";
		this.setTitle(S.recTitle(e.name));

		new Setting(this.contentEl).setName(S.recState).addDropdown((d) => {
			d.addOption("", S.recKeep(nowState));
			for (const s of RECORDABLE_STATES) if (s !== nowState) d.addOption(s, s);
			d.onChange((v) => { state = v; });
		});
		let phase: TextComponent | null = null;
		new Setting(this.contentEl).setName(S.recPhase).setDesc(S.recPhaseDesc(x.donePhase, x.lastPhase))
			.addText((t) => {
				phase = t;
				t.inputEl.inputMode = "numeric";
				t.onChange((v) => { done = v; });
			})
			.addExtraButton((b) => b.setIcon("plus").setTooltip(S.recPhaseNext).onClick(() => {
				done = String((x.donePhase ?? -1) + 1);
				phase?.setValue(done);
			}));
		new Setting(this.contentEl).setName(S.recWaiting).addDropdown((d) => {
			d.addOption("", S.recKeep(nowWaiting));
			for (const w of WAITINGS) if (w !== nowWaiting) d.addOption(w, w);
			d.onChange((v) => { waiting = v; });
		});
		new Setting(this.contentEl).setName(S.recNote).setDesc(S.recNoteDesc).addText((t) => {
			t.setValue(note);
			t.inputEl.maxLength = 200;
			t.inputEl.addClass("sb-record-note");
			t.onChange((v) => { note = v; });
		});
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText(S.recSave).setCta().onClick(() => {
				const change: RecordChange = {};
				if (state) change.state = state;
				if (waiting) change.waiting = waiting;
				if (done.trim() !== "") change.donePhase = /^\d+$/.test(done.trim()) ? Number(done.trim()) : NaN;
				const n = cleanNote(note);
				if (n !== (e.note ?? "")) change.note = n === "" ? null : n;
				const err = checkChange(change, x.lastPhase);
				if (err) {
					new Notice(err);
					return;
				}
				void this.plugin.writeRecord(e, change).then((ok) => {
					if (ok) this.close();
				});
			}))
			.addButton((b) => b.setButtonText(S.recCancel).onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
