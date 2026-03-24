"use strict";

(function initOptionsI18n() {
  const STORAGE_KEY = "oa_locale_mode";

  const MESSAGES = {
    zh: {
      options_page_title: "Side-by-Side AI - 选项",
      options_close: "关闭",
      close: "关闭",
      settings_title: "设置",
      settings_intro_kicker: "Workspace",
      settings_intro_title: "把站点、窗口和界面偏好收进一个干净的侧边设置。",
      settings_intro_body: "输入区只保留提问和发送，其他操作都回到这里。",
      sites_tab: "站点",
      appearance_tab: "外观",
      language_mode: "语言",
      options_header_kicker: "控制台",
      options_header_title: "窗口编排、广播和历史都集中在这里。",
      options_header_intro:
        "参考 main repo 那套输入条和设置层级，把多窗口 workflow 放进一个更顺手的控制台里。",
      options_embed_toggle: "在支持的 AI 网页右侧显示吸边侧栏按钮（可随时关掉）",
      options_pref_language: "语言",
      options_pref_theme: "主题",
      theme_system: "跟随系统",
      theme_light: "浅色",
      theme_dark: "深色",
      language_auto: "跟随浏览器",
      language_zh: "中文",
      language_en: "English",
      options_quick_title: "快捷操作",
      options_quick_intro: "先勾选目标，再一键打开、重排或关闭多开窗口。",
      options_quick_open: "打开并平铺",
      options_quick_tile: "仅重排窗口",
      options_quick_close: "关闭已开窗口",
      broadcast_title: "广播提示词",
      combine_latest: "汇总最新回复",
      new_chat: "新聊天",
      prompt_label: "输入问题",
      prompt_placeholder: "输入问题；回车发送（Shift+Enter 换行）",
      send: "发送",
      focus_title: "快速聚焦已绑定窗口",
      refresh_list: "刷新列表",
      history_title: "发送历史",
      history_subtitle: "点击历史中的站点链接可回到对应页面。",
      clear: "清空",
      sites_subtitle: "选择哪些站点会参与发送和打开窗口。",
      window_layout_title: "窗口与布局",
      windows_subtitle: "这里只保留多窗口 workflow 相关配置和动作。",
      window_mode_label: "新窗口外观",
      window_mode_minimal: "极简（无标签栏）",
      window_mode_normal: "标准（完整窗口）",
      window_mode_hint: "仅影响新打开或拆分出来的窗口。",
      layout_label: "窗口排列",
      layout_auto: "自动",
      layout_horizontal: "横排均分",
      layout_vertical: "竖排均分",
      layout_focus_left: "主窗在左，其余竖排",
      layout_focus_top: "主窗在上，其余横排",
      layout_two_top_one_bottom: "三窗：上二下一",
      layout_one_left_two_right: "三窗：左一右二",
      layout_grid_2x2: "四窗：2×2",
      sites_checked_title: "发送目标（勾选）",
      running_state_title: "窗口状态",
      appearance_subtitle: "只保留主题，不再把别的杂项塞进设置。",
      language_subtitle: "界面语言只保留 auto / 中文 / English。",
      open_windows: "打开 / 复用窗口",
      tile: "平铺",
      retile: "重排",
      focus_first: "聚焦首个",
      close_all_targets: "关闭全部已开窗口",
      refresh_state: "刷新状态",
      drag_sort: "拖拽排序",
      history_empty: "暂无发送记录。成功广播提示词后会出现在这里。",
      history_deleted: "删除",
      history_restore_title: "点击：已绑定的各站点标签页会打开对应 URL",
      history_restore_missing: "该条没有保存各站点 URL 快照，无法恢复页面",
      history_body_empty: "（无正文）",
      history_meta_links: "{time} · {count} 个站点链接 · {sites}",
      status_pick_sites: "请先在下方勾选目标站点。",
      status_combining: "正在汇总各窗口最新回复…",
      status_combined: "已汇总到输入框。",
      status_new_chat_sent: "已请求各站点新对话。",
      status_sending: "正在发送…",
      status_sent: "已发送到各窗口。",
      status_attachments_ready: "已附加 {count} 张图片，会一起发送到所选站点。",
      status_attachments_failed: "读取剪贴板图片失败，请重试。",
      status_restore_running: "正在恢复各站点页面…",
      status_restore_failed: "恢复失败：{reason}",
      status_restore_done: "已导航 {count} 个已绑定标签页。未绑定的站点请先在下方勾选并打开对应窗口。",
      status_restore_none: "没有已绑定的标签页可导航，请先勾选目标并打开对应站点。",
      status_quick_focus_empty: "暂无已绑定的 AI 窗口。请先勾选站点并打开窗口，或点击上方快捷操作。",
      status_quick_focus_error: "无法连接扩展后台，请重试。",
      quick_focus_button: "聚焦 {name}",
      settings_pick_sites: "请先勾选站点。",
      settings_pick_one_site: "请先勾选至少一个站点。",
      settings_opening: "正在打开窗口…",
      settings_open_failed: "打开失败：{reason}",
      settings_tiling: "正在按所选布局平铺…",
      settings_tile_failed: "平铺失败：{reason}",
      settings_tiled: "已按所选布局平铺（最多 4 个目标）。",
      settings_focus_missing: "没有可聚焦的窗口：请先打开对应 AI 页签，或点“打开 / 复用窗口”。",
      settings_focus_failed: "无法聚焦：窗口可能已关闭，请重新打开。",
      settings_focus_done: "已聚焦 {target}",
      settings_close_all_running: "正在关闭全部已绑定窗口…",
      settings_close_all_failed: "关闭全部失败：{reason}",
      settings_close_all_done: "已关闭 {count} 个已绑定标签页。",
      settings_state_missing: "未选择站点",
      settings_state_open: "{name}：窗口 #{windowId}",
      settings_state_closed: "{name}：未打开或已关闭",
      combine_unavailable: "[未获取到回复]",
      combine_footer: "请在这里写你的要求"
    },
    en: {
      options_page_title: "Side-by-Side AI - Options",
      options_close: "Close",
      close: "Close",
      settings_title: "Settings",
      settings_intro_kicker: "Workspace",
      settings_intro_title: "Keep sites, window controls, and interface preferences in one clean drawer.",
      settings_intro_body: "The input bar only handles writing and sending. Everything else lives here.",
      sites_tab: "Sites",
      appearance_tab: "Appearance",
      language_mode: "Language",
      options_header_kicker: "Controller",
      options_header_title: "Window tiling, broadcast, and history in one place.",
      options_header_intro:
        "This mirrors the main repo's visual hierarchy so the multi-window workflow feels deliberate instead of experimental.",
      options_embed_toggle: "Show the docked sidebar button on supported AI pages (can be turned off anytime)",
      options_pref_language: "Language",
      options_pref_theme: "Theme",
      theme_system: "System",
      theme_light: "Light",
      theme_dark: "Dark",
      language_auto: "Follow Browser",
      language_zh: "Chinese",
      language_en: "English",
      options_quick_title: "Quick Actions",
      options_quick_intro: "Select targets first, then open, retile, or close them in one step.",
      options_quick_open: "Open and tile",
      options_quick_tile: "Retile only",
      options_quick_close: "Close open targets",
      broadcast_title: "Broadcast Prompt",
      combine_latest: "Combine Latest",
      new_chat: "New Chat",
      prompt_label: "Prompt",
      prompt_placeholder: "Message... Enter sends (Shift+Enter newline)",
      send: "Send",
      focus_title: "Quick Focus for Bound Windows",
      refresh_list: "Refresh",
      history_title: "History",
      history_subtitle: "Click a saved entry to restore its URLs into the currently bound tabs.",
      clear: "Clear",
      sites_subtitle: "Choose which sites participate in send and open-window actions.",
      window_layout_title: "Windows and Layout",
      windows_subtitle: "Only multi-window workflow controls stay here.",
      window_mode_label: "New Window Style",
      window_mode_minimal: "Minimal (popup style)",
      window_mode_normal: "Standard browser window",
      window_mode_hint: "Only affects newly opened or detached windows.",
      layout_label: "Window Arrangement",
      layout_auto: "Auto",
      layout_horizontal: "Split horizontally",
      layout_vertical: "Split vertically",
      layout_focus_left: "Primary left, others stacked",
      layout_focus_top: "Primary top, others in a row",
      layout_two_top_one_bottom: "3 windows: two top, one bottom",
      layout_one_left_two_right: "3 windows: one left, two right",
      layout_grid_2x2: "4 windows: 2x2",
      sites_checked_title: "Send Targets",
      running_state_title: "Window State",
      appearance_subtitle: "Only theme stays here. The rest of the settings clutter is gone.",
      language_subtitle: "UI language only keeps auto / Chinese / English.",
      open_windows: "Open / Reuse Windows",
      tile: "Tile",
      retile: "Retile",
      focus_first: "Focus First",
      close_all_targets: "Close All Open Targets",
      refresh_state: "Refresh State",
      drag_sort: "Drag to sort",
      history_empty: "No send history yet. Successful broadcasts will appear here.",
      history_deleted: "Delete",
      history_restore_title: "Click to restore the saved URLs into the currently bound tabs",
      history_restore_missing: "This entry has no saved URL snapshot, so it cannot restore pages",
      history_body_empty: "(Empty)",
      history_meta_links: "{time} · {count} site links · {sites}",
      status_pick_sites: "Select at least one target site first.",
      status_combining: "Combining the latest replies from each window...",
      status_combined: "Combined replies were inserted into the prompt box.",
      status_new_chat_sent: "Requested a new chat on each selected site.",
      status_sending: "Sending...",
      status_sent: "Sent to the selected windows.",
      status_attachments_ready: "Attached {count} image(s). They will be sent to every selected site.",
      status_attachments_failed: "Failed to read the pasted image. Please retry.",
      status_restore_running: "Restoring saved site URLs...",
      status_restore_failed: "Restore failed: {reason}",
      status_restore_done: "Navigated {count} bound tabs. Open missing targets first if needed.",
      status_restore_none: "No bound tabs were available. Select targets and open them first.",
      status_quick_focus_empty: "No AI windows are currently bound. Select sites and open them first, or use the quick actions above.",
      status_quick_focus_error: "Unable to reach the extension background. Please retry.",
      quick_focus_button: "Focus {name}",
      settings_pick_sites: "Select at least one site first.",
      settings_pick_one_site: "Select at least one site first.",
      settings_opening: "Opening windows...",
      settings_open_failed: "Open failed: {reason}",
      settings_tiling: "Applying the selected arrangement...",
      settings_tile_failed: "Tiling failed: {reason}",
      settings_tiled: "Applied the selected arrangement (up to 4 targets).",
      settings_focus_missing: "No focusable window is available yet. Open a matching AI tab or use Open / Reuse Windows first.",
      settings_focus_failed: "Could not focus the target window. It may have been closed.",
      settings_focus_done: "Focused {target}.",
      settings_close_all_running: "Closing all bound targets...",
      settings_close_all_failed: "Close all failed: {reason}",
      settings_close_all_done: "Closed {count} bound tabs.",
      settings_state_missing: "No sites selected",
      settings_state_open: "{name}: window #{windowId}",
      settings_state_closed: "{name}: not open or already closed",
      combine_unavailable: "[Unavailable]",
      combine_footer: "Write your request here"
    }
  };

  let locale = "zh";
  let localeMode = "auto";
  let initPromise = null;

  function resolveLocale(mode) {
    if (mode === "zh" || mode === "en") return mode;
    const lang = String(chrome.i18n?.getUILanguage?.() || navigator.language || "").toLowerCase();
    return lang.startsWith("zh") ? "zh" : "en";
  }

  function t(key) {
    return MESSAGES[locale]?.[key] || MESSAGES.en[key] || key;
  }

  function format(key, vars = {}) {
    return String(t(key)).replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all));
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((node) => {
      node.setAttribute("title", t(node.getAttribute("data-i18n-title")));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria-label")));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder")));
    });
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t("options_page_title");
  }

  async function ready() {
    if (!initPromise) {
      initPromise = chrome.storage.local.get([STORAGE_KEY]).then((data) => {
        localeMode = data[STORAGE_KEY] === "zh" || data[STORAGE_KEY] === "en" ? data[STORAGE_KEY] : "auto";
        locale = resolveLocale(localeMode);
        apply();
      });
    }
    await initPromise;
    return locale;
  }

  async function setLocaleMode(mode) {
    localeMode = mode === "zh" || mode === "en" ? mode : "auto";
    await chrome.storage.local.set({ [STORAGE_KEY]: localeMode });
    locale = resolveLocale(localeMode);
    apply();
    window.dispatchEvent(new CustomEvent("oa-options-locale-changed", { detail: { locale, localeMode } }));
  }

  window.OA_OPTIONS_I18N = {
    ready,
    t,
    format,
    apply,
    getLocale: () => locale,
    getLocaleMode: () => localeMode,
    setLocaleMode
  };
})();
