/**
 * drawio-poc: 閉域環境向け設定 (公式 js/PreConfig.js の差し替え)
 *
 * 公式の PreConfig.js と同じく、アプリ本体より前に読み込まれる。
 * 公式の既定値 (先頭の window.* 群) は変更していない。
 * 閉域対応の設定は末尾の「drawio-poc」ブロックのみ。
 */
// Overrides of global vars need to be pre-loaded
window.DRAWIO_PUBLIC_BUILD = true;
window.EXPORT_URL = null; // サーバー側エクスポートは使用しない (PDF は印刷ダイアログ経由)
window.DRAWIO_BASE_URL = null;
window.DRAWIO_VIEWER_URL = null;
window.DRAWIO_LIGHTBOX_URL = null;
window.DRAW_MATH_URL = 'math4/es5';
urlParams['sync'] = 'manual';

/* ---- drawio-poc: ここから ---- */

// 外部通信の抑止。URL パラメータでは上書きされないよう、ここで固定する。
//  lockdown / stealth : Google Drive・OneDrive・Dropbox・GitHub・GitLab・Trello 連携、
//                       ログ送信、リアルタイム同期 (Pusher) を無効化する
//                       (Init.js が db/od/gh/gl/tr/ms365/gapi/picker=0 を設定する)
//  pwa / enableSW     : サービスワーカー (PWA) は使用しない
//  plugins            : 外部プラグインを読み込まない
//  mode=device        : 保存先は端末のローカルファイルとする
// offline=1 は採用しない。公式実装では offline=1 がサービスワーカー登録を有効にするため。
urlParams['lockdown'] = '1';
urlParams['stealth'] = '1';
urlParams['pwa'] = '0';
urlParams['enableSW'] = '0';
urlParams['plugins'] = '0';
urlParams['mode'] = 'device';
delete urlParams['offline'];
delete urlParams['p'];

// 公式の構成オプション (DRAWIO_CONFIG)。
//  enableAi      : AI 連携 (外部 API) を使用しない
//  hideMenuItems : 「共有」(Google Drive / OneDrive 専用) をメニューから外す
//  css           : 同じく「共有」ボタンを非表示にする
window.DRAWIO_CONFIG = {
	enableAi: false,
	hideMenuItems: ['share'],
	css: '.geButtonContainer > button.gePrimaryBtn { display: none !important; }'
};

// 日本語 UI を初期状態にする。URL の lang= と、利用者が設定で選んだ言語は尊重する。
(function()
{
	var stored = null;

	try
	{
		stored = JSON.parse(localStorage.getItem('.drawio-config')).language;
	}
	catch (e)
	{
		// 未設定
	}

	if (urlParams['lang'] == null && !stored)
	{
		window.mxLanguage = 'ja';
	}
})();

/* ---- drawio-poc: ここまで ---- */
