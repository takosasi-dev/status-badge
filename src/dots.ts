// ファイル一覧の行の色の点(FR-20)。本体の DOM は探さず、data-path 属性に当てる CSS を自分の stylesheet で足すだけ。
// <style> 要素は作らず adoptedStyleSheets に1枚足し、無効にしたら外す。点が出るのはメインの窓だけ。
// ponytail: 本体の .nav-file-title[data-path] に頼る。本体が属性名を変えたら点が出なくなる(印や一覧は困らない)。
import { dotCss, type Tone } from "./resolve";

export class Dots {
	private sheet: CSSStyleSheet | null = null;

	set(dots: { path: string; tone: Tone }[]): void {
		if (!dots.length) return this.clear();
		if (!this.sheet) {
			this.sheet = new CSSStyleSheet();
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.sheet];
		}
		this.sheet.replaceSync(dotCss(dots));
	}

	clear(): void {
		if (!this.sheet) return;
		const s = this.sheet;
		document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== s);
		this.sheet = null;
	}
}
