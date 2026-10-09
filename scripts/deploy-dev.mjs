// 開発用 vault のプラグインフォルダへ、ビルド物3つ(main.js・manifest.json・styles.css)を写す(§9.8)。
// 写し先は環境変数 SB_DEV_PLUGIN_DIR で渡す(パスをコードや package.json に書かない)。
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dest = process.env.SB_DEV_PLUGIN_DIR;
if (!dest) {
	console.error("SB_DEV_PLUGIN_DIR に、開発用 vault の .obsidian/plugins/status-badge を入れてください");
	process.exit(2);
}
mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
	if (!existsSync(f)) {
		console.error(`${f} がありません(先に npm run build)`);
		process.exit(2);
	}
	copyFileSync(f, join(dest, f));
}
console.log(`写しました: ${dest}`);
