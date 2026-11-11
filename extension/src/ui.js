/* 面板 UI：Shadow DOM 隔离；文件夹操作、归类、新对话提示、备份 */
(function () {
  "use strict";

  var HOST_ID = "dscm-ui-host";
  var scriptSrc = (document.currentScript && document.currentScript.src) || "";
  var cssHref = scriptSrc.replace(/ui\.js(\?.*)?$/, "panel.css");
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    cssHref = chrome.runtime.getURL("src/panel.css");
  }

  var state = {
    data: { folders: [], membership: {}, settings: { promptNew: true } },
    open: false,
    entryEl: null,
    view: { mode: "list" },
    dragging: null
  };

  var hostEl = null;
  var shadow = null;
  var panelEl = null;
  var bodyEl = null;
  var footerEl = null;
  var addBtn = null;
  var backBtn = null;
  var titleEl = null;
  var menuEl = null;
  var toastEl = null;
  var inputRow = null;
  var promptEl = null;
  var promptQueue = [];
  var promptTimer = null;
  var renamingId = null;
  var deletingId = null;

  function h(tag, props, kids) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === "class") el.className = props[k];
        else if (k === "value") el.value = props[k];
        else el.setAttribute(k, props[k]);
      });
    }
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    });
    return el;
  }

  function isDark() {
    var root = document.documentElement;
    var body = document.body;
    var cls = ((root && root.className) || "") + " " + ((body && body.className) || "");
    if (/(^|\s)(dark|theme-dark)(\s|$)/i.test(cls)) return true;
    if (/(^|\s)(light|theme-light)(\s|$)/i.test(cls)) return false;
    try {
      var bg = getComputedStyle(body).backgroundColor || "";
      var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        var lum = (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
        return lum < 0.5;
      }
    } catch (err) { /* 忽略 */ }
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function ensureHost() {
    if (hostEl && document.documentElement.contains(hostEl)) return;
    hostEl = document.createElement("div");
    hostEl.id = HOST_ID;
    hostEl.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483000;pointer-events:none;";
    shadow = hostEl.attachShadow({ mode: "open" });

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    shadow.appendChild(link);

    panelEl = h("section", { class: "panel", role: "dialog", "aria-label": "对话文件夹" });
    panelEl.hidden = true;

    backBtn = h("button", { class: "back", type: "button", title: "返回" }, ["\u2039"]);
    backBtn.hidden = true;
    backBtn.addEventListener("click", function () {
      state.view = { mode: "list" };
      render();
    });

    titleEl = h("span", { class: "title" }, ["文件夹"]);
    var titleWrap = h("div", { class: "title-wrap" }, [backBtn, titleEl]);

    var closeBtn = h("button", { class: "x", type: "button", title: "关闭" }, ["\u00d7"]);
    closeBtn.addEventListener("click", closePanel);

    var header = h("header", {}, [titleWrap, closeBtn]);
    bodyEl = h("div", { class: "body" });

    addBtn = h("button", { class: "add", type: "button" }, ["\uff0b 新建文件夹"]);
    addBtn.addEventListener("click", showInput);

    var moreBtn = h("button", { class: "foot-more", type: "button", title: "更多" }, ["\u22ef"]);
    moreBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      showFooterMenu(moreBtn);
    });

    footerEl = h("footer", {}, [addBtn, moreBtn]);

    panelEl.appendChild(header);
    panelEl.appendChild(bodyEl);
    panelEl.appendChild(footerEl);
    shadow.appendChild(panelEl);
    document.documentElement.appendChild(hostEl);

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  }

  function place() {
    if (!panelEl || !state.entryEl) return;
    var rect = state.entryEl.getBoundingClientRect();
    var width = 288;
    var left = Math.min(rect.right + 10, window.innerWidth - width - 12);
    if (left < 8) left = 8;
    var top = Math.max(12, rect.top - 6);
    if (top + 380 > window.innerHeight) top = Math.max(12, window.innerHeight - 440);
    panelEl.style.left = left + "px";
    panelEl.style.top = top + "px";
  }

  function findFolder(data, id) {
    for (var i = 0; i < data.folders.length; i += 1) {
      if (data.folders[i].id === id) return data.folders[i];
    }
    return null;
  }

  function openConversation(convId) {
    if (window.DSCM && window.DSCM.openConversation) window.DSCM.openConversation(convId);
    closePanel();
  }

  function showToast(text) {
    if (!shadow) return;
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = h("div", { class: "toast" }, [text]);
    shadow.appendChild(toastEl);
    setTimeout(function () {
      if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      toastEl = null;
    }, 1800);
  }

  function assignTo(convId, title, folderId) {
    return window.DSCMStore.assign(convId, folderId, title).then(function () {
      var folder = findFolder(state.data, folderId);
      return render().then(function () {
        showToast("已放入「" + (folder ? folder.name : "文件夹") + "」");
      });
    }).catch(function (err) {
      showToast((err && err.message) || "归类失败");
    });
  }

  /* ---------- 菜单 ---------- */

  function positionMenu(menu, x, y, alignRight) {
    var w = menu.offsetWidth;
    var hgt = menu.offsetHeight;
    var left = alignRight ? x - w : x;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    var top = Math.max(8, Math.min(y, window.innerHeight - hgt - 8));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function menuItem(menu, label, onClick, extraClass) {
    var el = h("div", { class: "mi" + (extraClass ? " " + extraClass : "") }, [h("span", {}, [label])]);
    el.addEventListener("click", onClick);
    menu.appendChild(el);
    return el;
  }

  function closeMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
  }

  function showFolderMenu(folder, anchorEl) {
    closeMenu();
    var menu = h("div", { class: "menu" }, [h("div", { class: "ttl" }, [folder.name])]);
    menuItem(menu, "重命名", function () {
      closeMenu();
      renamingId = folder.id;
      render();
    });
    menuItem(menu, folder.pinned ? "取消置顶" : "置顶", function () {
      closeMenu();
      window.DSCMStore.togglePin(folder.id).then(render);
    });
    menuItem(menu, "上移", function () {
      closeMenu();
      window.DSCMStore.moveFolder(folder.id, -1).then(render);
    });
    menuItem(menu, "下移", function () {
      closeMenu();
      window.DSCMStore.moveFolder(folder.id, 1).then(render);
    });
    menu.appendChild(h("div", { class: "sep" }));
    menuItem(menu, "删除文件夹", function () {
      closeMenu();
      deletingId = folder.id;
      render();
    }, "danger");

    shadow.appendChild(menu);
    var r = anchorEl.getBoundingClientRect();
    positionMenu(menu, r.right + 4, r.bottom + 4, true);
    menuEl = menu;
  }

  function showFooterMenu(anchorEl) {
    closeMenu();
    window.DSCMStore.read().then(function (data) {
      state.data = data;
      var menu = h("div", { class: "menu" }, [h("div", { class: "ttl" }, ["更多"])]);
      menuItem(menu, "导出备份", function () { closeMenu(); exportBackup(); });
      menuItem(menu, "导入备份…", function () { closeMenu(); importBackup(); });
      menu.appendChild(h("div", { class: "sep" }));
      var toggle = h("div", { class: "mi check" }, [
        h("span", {}, ["新对话时询问"]),
        h("span", { class: "mark" }, [data.settings.promptNew ? "\u2713" : ""])
      ]);
      toggle.addEventListener("click", function () {
        closeMenu();
        window.DSCMStore.setSetting("promptNew", !data.settings.promptNew).then(render);
      });
      menu.appendChild(toggle);

      shadow.appendChild(menu);
      var r = anchorEl.getBoundingClientRect();
      positionMenu(menu, r.right + 4, r.top - 8, true);
      menuEl = menu;
    });
  }

  function showMoveMenu(opts) {
    ensureHost();
    closeMenu();
    window.DSCMStore.read().then(function (data) {
      state.data = data;
      var current = window.DSCMStore.folderOf(data, opts.convId);
      var menu = h("div", { class: "menu" }, [h("div", { class: "ttl" }, ["移动到文件夹"])]);
      if (!data.folders.length) {
        menu.appendChild(h("div", { class: "hint-row" }, ["还没有文件夹"]));
      }
      window.DSCMStore.sortedFolders(data).forEach(function (folder) {
        var item = h("div", { class: "mi" }, [
          h("span", {}, [folder.name]),
          h("span", { class: "mark" }, [current === folder.id ? "\u2713" : ""])
        ]);
        item.addEventListener("click", function () {
          closeMenu();
          assignTo(opts.convId, opts.title, folder.id);
        });
        menu.appendChild(item);
      });
      if (current) {
        menu.appendChild(h("div", { class: "sep" }));
        var rm = h("div", { class: "mi" }, ["移出文件夹"]);
        rm.addEventListener("click", function () {
          closeMenu();
          window.DSCMStore.unassign(opts.convId).then(render);
        });
        menu.appendChild(rm);
      }
      menuEl = menu;
      shadow.appendChild(menu);
      positionMenu(menu, opts.x, opts.y, false);
    });
  }

  /* ---------- 行 ---------- */

  function folderRow(folder) {
    var more = h("button", { class: "more", type: "button", title: "文件夹操作" }, ["\u22ef"]);
    more.addEventListener("click", function (evt) {
      evt.stopPropagation();
      showFolderMenu(folder, more);
    });
    var row = h("div", { class: "row" + (folder.pinned ? " pinned" : ""), role: "button", tabindex: "0" }, [
      h("span", { class: "chev" }, [folder.pinned ? "\u2605" : "\u203a"]),
      h("span", { class: "nm" }, [folder.name]),
      h("span", { class: "ct" }, [String(window.DSCMStore.countOf(state.data, folder.id))]),
      more
    ]);
    row.dataset.id = folder.id;
    row.addEventListener("click", function () { openFolder(folder.id); });
    row.addEventListener("dragover", onFolderDragOver);
    row.addEventListener("dragleave", onFolderDragLeave);
    row.addEventListener("drop", onFolderDrop);
    return row;
  }

  function renameRow(folder) {
    var input = h("input", { type: "text", maxlength: "24", value: folder.name });
    var save = h("button", { class: "ok", type: "button" }, ["保存"]);
    var wrap = h("div", { class: "input-row" }, [input, save]);
    function submit() {
      window.DSCMStore.renameFolder(folder.id, input.value).then(function () {
        renamingId = null;
        return render();
      }).catch(function (err) {
        input.placeholder = (err && err.message) || "改名失败";
        input.value = "";
      });
    }
    save.addEventListener("click", submit);
    input.addEventListener("keydown", function (evt) {
      if (evt.key === "Enter") { evt.preventDefault(); submit(); }
      else if (evt.key === "Escape") { evt.stopPropagation(); renamingId = null; render(); }
    });
    setTimeout(function () { input.focus(); input.select(); }, 0);
    return wrap;
  }

  function confirmRow(folder) {
    var cancel = h("button", { class: "ghost", type: "button" }, ["取消"]);
    var del = h("button", { class: "danger-solid", type: "button" }, ["删除"]);
    var wrap = h("div", { class: "confirm" }, [
      h("div", { class: "confirm-text" }, ["删除「" + folder.name + "」？对话不会被删，只会回到未归类。"]),
      h("div", { class: "confirm-actions" }, [cancel, del])
    ]);
    cancel.addEventListener("click", function () {
      deletingId = null;
      render();
    });
    del.addEventListener("click", function () {
      deletingId = null;
      window.DSCMStore.removeFolder(folder.id).then(function () {
        return render();
      }).then(function () { showToast("已删除文件夹"); });
    });
    return wrap;
  }

  function convRow(item) {
    var removeBtn = h("button", { class: "rm", type: "button", title: "移出文件夹" }, ["移出"]);
    var row = h("div", { class: "conv", title: item.title }, [
      h("span", { class: "dot" }),
      h("span", { class: "t" }, [item.title]),
      removeBtn
    ]);
    row.addEventListener("click", function () { openConversation(item.convId); });
    removeBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      window.DSCMStore.unassign(item.convId).then(render);
    });
    return row;
  }

  function onFolderDragOver(evt) {
    if (!state.dragging && !(evt.dataTransfer && evt.dataTransfer.types && Array.prototype.indexOf.call(evt.dataTransfer.types, "text/plain") >= 0)) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    try { evt.dataTransfer.dropEffect = "move"; } catch (err) { /* 忽略 */ }
    this.classList.add("drop");
  }

  function onFolderDragLeave() {
    this.classList.remove("drop");
  }

  function onFolderDrop(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    this.classList.remove("drop");
    var folderId = this.dataset.id;
    var payload = state.dragging;
    var convId = (payload && payload.id) || (evt.dataTransfer && evt.dataTransfer.getData("text/plain"));
    var title = (payload && payload.title) || "";
    state.dragging = null;
    if (!convId) return;
    assignTo(convId, title, folderId);
  }

  /* ---------- 绘制 ---------- */

  function paintList(data) {
    var folders = window.DSCMStore.sortedFolders(data);
    if (!folders.length && !renamingId) {
      bodyEl.appendChild(h("div", { class: "empty" }, ["还没有文件夹", h("br"), "建一个，把对话拖进来"]));
      return;
    }
    folders.forEach(function (folder) {
      if (deletingId === folder.id) bodyEl.appendChild(confirmRow(folder));
      else if (renamingId === folder.id) bodyEl.appendChild(renameRow(folder));
      else bodyEl.appendChild(folderRow(folder));
    });
  }

  function paintFolder(data, folder) {
    var items = window.DSCMStore.itemsOf(data, folder.id);
    if (!items.length) {
      bodyEl.appendChild(h("div", { class: "empty" }, ["这个文件夹还是空的", h("br"), "把左侧的对话拖到这里"]));
      return;
    }
    items.forEach(function (item) {
      var title = item.title;
      if (window.DSCM && window.DSCM.lookupTitle) {
        var real = window.DSCM.lookupTitle(item.convId);
        if (real && real !== title) title = real;
      }
      bodyEl.appendChild(convRow({ convId: item.convId, title: title }));
    });
  }

  function updateChrome(data, folder) {
    var inFolder = !!folder;
    titleEl.textContent = inFolder ? folder.name : "文件夹";
    backBtn.hidden = !inFolder;
    footerEl.hidden = inFolder;
    if (inFolder) hideInput();
    var countEl = state.entryEl && state.entryEl.querySelector(".dscm-count");
    if (countEl) countEl.textContent = data.folders.length ? String(data.folders.length) : "";
  }

  function render() {
    if (!bodyEl) return Promise.resolve();
    return window.DSCMStore.read().then(function (data) {
      state.data = data;
      var folder = state.view.mode === "folder" ? findFolder(data, state.view.id) : null;
      if (state.view.mode === "folder" && !folder) state.view = { mode: "list" };
      Array.prototype.slice.call(bodyEl.querySelectorAll(".row, .conv, .empty, .input-row, .confirm")).forEach(function (node) {
        node.remove();
      });
      updateChrome(data, folder);
      if (folder) paintFolder(data, folder);
      else paintList(data);
    });
  }

  function hideInput() {
    if (inputRow && inputRow.parentNode) inputRow.parentNode.removeChild(inputRow);
    inputRow = null;
  }

  function showInput() {
    ensureHost();
    if (inputRow) {
      inputRow.querySelector("input").focus();
      return;
    }
    var input = h("input", { type: "text", maxlength: "24", placeholder: "文件夹名称，回车确认" });
    var ok = h("button", { type: "button" }, ["确定"]);
    inputRow = h("div", { class: "input-row" }, [input, ok]);
    bodyEl.insertBefore(inputRow, bodyEl.firstChild);

    function submit() {
      window.DSCMStore.addFolder(input.value).then(function () {
        input.value = "";
        input.placeholder = "文件夹名称，回车确认";
        hideInput();
        return render();
      }).catch(function (err) {
        input.placeholder = (err && err.message) || "创建失败";
      });
    }

    ok.addEventListener("click", submit);
    input.addEventListener("keydown", function (evt) {
      if (evt.key === "Enter") { evt.preventDefault(); submit(); }
      else if (evt.key === "Escape") { evt.stopPropagation(); hideInput(); }
    });
    input.focus();
  }

  /* ---------- 备份 ---------- */

  function exportBackup() {
    window.DSCMStore.read().then(function (data) {
      var payload = {
        app: "dscm",
        version: 1,
        exportedAt: new Date().toISOString(),
        folders: data.folders,
        membership: data.membership,
        settings: data.settings
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "dscm-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showToast("已导出备份");
    });
  }

  function importBackup() {
    ensureHost();
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    shadow.appendChild(input);
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) { input.remove(); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var obj = JSON.parse(String(reader.result));
          if (!window.confirm("导入会覆盖当前的文件夹和归类，确定？")) { input.remove(); return; }
          window.DSCMStore.importData(obj).then(function () {
            input.remove();
            render();
            showToast("导入完成");
          }).catch(function (err) {
            showToast((err && err.message) || "导入失败");
          });
        } catch (err) {
          input.remove();
          showToast("文件格式不对");
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ---------- 新对话提示 ---------- */

  function promptNew(info) {
    ensureHost();
    window.DSCMStore.read().then(function (data) {
      if (!data.settings.promptNew) return;
      if (data.membership[info.id]) return;
      promptQueue.push(info);
      flushPrompt(data);
    });
  }

  function closePrompt() {
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = null;
    if (promptEl && promptEl.parentNode) promptEl.parentNode.removeChild(promptEl);
    promptEl = null;
  }

  function flushPrompt(data) {
    if (promptEl || !promptQueue.length || !shadow) return;
    var info = promptQueue.shift();
    var rest = promptQueue.length;
    var chips = h("div", { class: "chips" });
    window.DSCMStore.sortedFolders(data).slice(0, 6).forEach(function (folder) {
      var chip = h("button", { class: "chip", type: "button" }, [folder.name]);
      chip.addEventListener("click", function () {
        closePrompt();
        assignTo(info.id, info.title, folder.id).then(function () { flushPrompt(state.data); });
      });
      chips.appendChild(chip);
    });
    if (!data.folders.length) {
      chips.appendChild(h("span", { class: "chip-empty" }, ["还没有文件夹"]));
    }

    var ignore = h("button", { class: "ghost", type: "button" }, ["忽略"]);
    ignore.addEventListener("click", function () {
      closePrompt();
      flushPrompt(state.data);
    });

    promptEl = h("div", { class: "prompt" }, [
      h("div", { class: "prompt-head" }, ["新对话" + (rest ? "（还有 " + rest + " 条）" : "")]),
      h("div", { class: "prompt-title" }, [info.title || "未命名对话"]),
      chips,
      h("div", { class: "prompt-foot" }, [h("span", { class: "hint" }, ["放进哪个文件夹？"]), ignore])
    ]);
    shadow.appendChild(promptEl);
    promptTimer = setTimeout(function () {
      closePrompt();
      flushPrompt(state.data);
    }, 20000);
  }

  /* ---------- 面板开关 ---------- */

  function onDocDown(evt) {
    var path = evt.composedPath ? evt.composedPath() : [];
    if (menuEl) {
      if (path.indexOf(menuEl) >= 0) return;
      closeMenu();
    }
    if (!state.open) return;
    if (path.indexOf(hostEl) >= 0) return;
    if (state.entryEl && path.indexOf(state.entryEl) >= 0) return;
    closePanel();
  }

  function openPanel() {
    if (!state.entryEl) return;
    ensureHost();
    place();
    panelEl.hidden = false;
    panelEl.setAttribute("data-theme", isDark() ? "dark" : "light");
    state.open = true;
    state.entryEl.classList.add("dscm-open");
    if (window.DSCM && window.DSCM.syncTitles) window.DSCM.syncTitles();
    render();
  }

  function openFolder(folderId) {
    state.view = { mode: "folder", id: folderId };
    if (!state.open) openPanel();
    render();
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.hidden = true;
    state.open = false;
    state.view = { mode: "list" };
    renamingId = null;
    deletingId = null;
    hideInput();
    closeMenu();
    if (state.entryEl) state.entryEl.classList.remove("dscm-open");
  }

  function toggle(entryEl) {
    if (entryEl) state.entryEl = entryEl;
    if (state.open) closePanel();
    else openPanel();
  }

  function attach(entryEl) {
    state.entryEl = entryEl;
    entryEl.classList.toggle("dscm-dark", isDark());
    window.DSCMStore.read().then(function (data) {
      state.data = data;
      var countEl = entryEl.querySelector(".dscm-count");
      if (countEl) countEl.textContent = data.folders.length ? String(data.folders.length) : "";
      if (bodyEl) return render();
      return null;
    });
  }

  function refresh() {
    if (state.entryEl) state.entryEl.classList.toggle("dscm-dark", isDark());
    if (panelEl) panelEl.setAttribute("data-theme", isDark() ? "dark" : "light");
    place();
  }

  function beginDrag(payload) {
    state.dragging = payload;
    if (!state.open) openPanel();
  }

  function endDrag() {
    state.dragging = null;
  }

  document.addEventListener("mousedown", onDocDown, true);
  document.addEventListener("keydown", function (evt) {
    if (evt.key !== "Escape") return;
    if (menuEl) { closeMenu(); return; }
    if (promptEl) { closePrompt(); return; }
    if (state.open) closePanel();
  }, true);

  window.DSCMUI = {
    attach: attach,
    toggle: toggle,
    open: openPanel,
    close: closePanel,
    openFolder: openFolder,
    render: render,
    refresh: refresh,
    showMoveMenu: showMoveMenu,
    promptNew: promptNew,
    toast: showToast,
    beginDrag: beginDrag,
    endDrag: endDrag,
    isOpen: function () { return state.open; }
  };
})();
