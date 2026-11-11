/* 入口：在原生对话列表顶部插一行「文件夹」；拖拽 / 右键归类；标题跟随；删除同步 */
(function () {
  "use strict";

  var ENTRY_ID = "dscm-entry";
  var LINK_SELECTOR = 'a[href*="/chat/s/"]';
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2 2 0 0 1 5 5.5h4l1.8 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

  var enabled = true;
  var observer = null;
  var debounceTimer = null;
  var reconcileTimer = null;
  var seenIds = new Set();
  var pendingRemoval = new Map();
  var knownIds = null;
  var bootAt = Date.now();
  var events = [];

  function convLinks() {
    return document.querySelectorAll(LINK_SELECTOR);
  }

  function convIdOf(href) {
    var m = String(href || "").match(/\/chat\/s\/([^/?#]+)/);
    return m ? m[1] : "";
  }

  function titleOf(anchor) {
    var titleEl = anchor.querySelector(".c08e6e93");
    var text = titleEl ? titleEl.textContent : anchor.textContent;
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  }

  function isScrollable(el) {
    try {
      var oy = getComputedStyle(el).overflowY;
      return oy === "auto" || oy === "scroll";
    } catch (err) {
      return false;
    }
  }

  function findListRoot() {
    var links = convLinks();
    if (!links.length) return null;
    var node = links[0];
    for (var i = 0; i < 8 && node && node.parentElement; i += 1) {
      var parent = node.parentElement;
      if (parent === document.body) break;
      if (parent.classList && parent.classList.contains("ds-scroll-area")) return node;
      if (isScrollable(parent)) return node;
      node = parent;
    }
    return null;
  }

  function findListRootFallback() {
    var links = convLinks();
    if (!links.length) return null;
    var total = links.length;
    var node = links[0];
    var best = links[0].parentElement;
    for (var i = 0; i < 6 && node && node.parentElement; i += 1) {
      node = node.parentElement;
      var n = node.querySelectorAll(LINK_SELECTOR).length;
      if (n >= Math.min(total, 2)) best = node;
    }
    return best;
  }

  /* 原生右上角那个工具按钮可能压住我们的入口行，量一下再让开 */
  function layoutGuard(entry) {
    if (!entry) entry = document.getElementById(ENTRY_ID);
    if (!entry) return;
    entry.style.marginTop = "";
    var inner = entry.parentElement && entry.parentElement.parentElement;
    var outer = inner && inner.parentElement;
    if (!outer) return;
    var entryRect = entry.getBoundingClientRect();
    if (!entryRect.height) return;
    var button = null;
    for (var i = 0; i < outer.children.length; i += 1) {
      var kid = outer.children[i];
      if (kid === inner) continue;
      if (kid.classList && kid.classList.contains("ds-button")) { button = kid; break; }
    }
    if (!button) return;
    var r = button.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var overlapX = r.left < entryRect.right && r.right > entryRect.left;
    var overlapY = r.top < entryRect.bottom && r.bottom > entryRect.top;
    if (!overlapX || !overlapY) return;
    var shift = Math.ceil(r.bottom - entryRect.top + 6);
    if (shift > 0 && shift < 240) entry.style.marginTop = shift + "px";
  }

  function buildEntry() {
    var el = document.createElement("div");
    el.id = ENTRY_ID;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("title", "对话文件夹");
    el.innerHTML = ICON + '<span class="dscm-label">文件夹</span><span class="dscm-count"></span>';
    el.addEventListener("click", function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      window.DSCMUI.toggle(el);
    });
    el.addEventListener("keydown", function (evt) {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        window.DSCMUI.toggle(el);
      }
    });
    return el;
  }

  function inject() {
    if (!enabled) return false;
    if (document.getElementById(ENTRY_ID)) return true;
    var root = findListRoot() || findListRootFallback();
    if (!root) return false;
    var entry = buildEntry();
    root.insertBefore(entry, root.firstElementChild);
    window.DSCMUI.attach(entry);
    requestAnimationFrame(function () { layoutGuard(entry); });
    return true;
  }

  function scheduleInject() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      inject();
    }, 200);
  }

  function teardown() {
    var entry = document.getElementById(ENTRY_ID);
    if (entry && entry.parentNode) entry.parentNode.removeChild(entry);
    if (window.DSCMUI) window.DSCMUI.close();
  }

  function applyEnabled(on) {
    enabled = !!on;
    if (enabled) {
      inject();
      scheduleInject();
    } else {
      teardown();
    }
  }

  function openConversation(convId) {
    if (!convId) return;
    var link = document.querySelector('a[href*="/chat/s/' + convId + '"]');
    if (link) {
      link.click();
      return;
    }
    location.assign("/a/chat/s/" + convId);
  }

  function collectIds() {
    var set = new Set();
    var links = convLinks();
    for (var i = 0; i < links.length; i += 1) {
      var id = convIdOf(links[i].getAttribute("href"));
      if (id) set.add(id);
    }
    return set;
  }

  var lastTitleSync = 0;
  var titleSyncTimer = null;

  /* 标题跟随：把原生列表里的真实标题同步回本地记录（限频，但会补一次） */
  function syncTitlesFromDom(force) {
    var wait = 4000 - (Date.now() - lastTitleSync);
    if (!force && wait > 0) {
      if (!titleSyncTimer) {
        titleSyncTimer = setTimeout(function () {
          titleSyncTimer = null;
          syncTitlesFromDom(true);
        }, wait + 50);
      }
      return;
    }
    lastTitleSync = Date.now();
    var map = {};
    var links = convLinks();
    for (var i = 0; i < links.length; i += 1) {
      var id = convIdOf(links[i].getAttribute("href"));
      if (id) map[id] = titleOf(links[i]);
    }
    if (!window.DSCMStore || !window.DSCMStore.syncTitles) return;
    window.DSCMStore.syncTitles(map).then(function (changed) {
      if (changed && window.DSCMUI) window.DSCMUI.render();
    });
  }

  function logEvent(type, id, title, extra) {
    events.push({ at: new Date().toISOString(), type: type, id: id, title: title || "", extra: extra || "" });
    if (events.length > 40) events.shift();
  }

  function anchorsById() {
    var map = {};
    var links = convLinks();
    for (var i = 0; i < links.length; i += 1) {
      var id = convIdOf(links[i].getAttribute("href"));
      if (id) map[id] = links[i];
    }
    return map;
  }

  /*
   * DeepSeek 里改名有可能重建会话（id 变化）：旧 id 消失、新 id 出现且标题相同。
   * 这种情况要把归类关系搬到新 id 上，而不是删掉。
   */
  function migrateRekey(vanished, fresh, pairByName) {
    if (!vanished.length || !fresh.length) return Promise.resolve({ from: [], to: [] });
    var byId = anchorsById();
    return window.DSCMStore.read().then(function (data) {
      var result = { from: [], to: [] };
      var used = {};
      vanished.forEach(function (oldId) {
        var entry = data.membership[oldId];
        if (!entry) return;
        var target = null;
        for (var i = 0; i < fresh.length; i += 1) {
          var newId = fresh[i];
          if (used[newId] || data.membership[newId]) continue;
          var anchor = byId[newId];
          if (!anchor) continue;
          if (titleOf(anchor) === entry.title) { target = newId; break; }
        }
        // 标题对不上、但这一刻「恰好一旧一新」：判定为改名重建（标题本身也改了）
        if (!target && pairByName && fresh.length === 1 && !used[fresh[0]] && !data.membership[fresh[0]]) {
          target = fresh[0];
        }
        if (!target) return;
        used[target] = true;
        data.membership[target] = { folderId: entry.folderId, title: entry.title, addedAt: entry.addedAt };
        delete data.membership[oldId];
        result.from.push(oldId);
        result.to.push(target);
        logEvent("rekey", oldId, entry.title, target);
      });
      if (!result.from.length) return result;
      return window.DSCMStore.write(data).then(function () {
        if (window.DSCMUI) window.DSCMUI.render();
        return result;
      });
    });
  }

  function promptFresh(ids) {
    if (!ids.length || !window.DSCMUI || !window.DSCMUI.promptNew) return;
    if (Date.now() - bootAt < 4000) return;
    if (ids.length > 3) return;
    ids.forEach(function (id) {
      var anchor = document.querySelector('a[href*="/chat/s/' + id + '"]');
      window.DSCMUI.promptNew({ id: id, title: anchor ? titleOf(anchor) : "" });
    });
  }

  function syncRemoved(id) {
    return window.DSCMStore.read().then(function (data) {
      var entry = data.membership[id];
      if (!entry) return null;

      // 保护：如果列表里出现了「同标题、不同 id」的一条，判定为改名换 id，迁移而不是删除
      var links = convLinks();
      var twin = "";
      for (var i = 0; i < links.length; i += 1) {
        var nid = convIdOf(links[i].getAttribute("href"));
        if (!nid || nid === id || data.membership[nid]) continue;
        if (titleOf(links[i]) === entry.title) { twin = nid; break; }
      }
      if (twin) {
        data.membership[twin] = { folderId: entry.folderId, title: entry.title, addedAt: entry.addedAt };
        delete data.membership[id];
        logEvent("rekey-late", id, entry.title, twin);
        return window.DSCMStore.write(data).then(function () {
          if (window.DSCMUI) window.DSCMUI.render();
        });
      }

      return window.DSCMStore.unassign(id).then(function () {
        logEvent("removed", id, entry.title);
        if (window.DSCMUI) {
          window.DSCMUI.render();
          window.DSCMUI.toast("对话已删除，文件夹里的记录同步移除");
        }
      });
    });
  }

  function reconcile() {
    var current = collectIds();
    if (!current.size) return;

    syncTitlesFromDom();

    var prev = seenIds;
    if (!prev.size) {
      seenIds = current;
      return;
    }

    var vanished = [];
    var fresh = [];
    prev.forEach(function (id) { if (!current.has(id)) vanished.push(id); });
    current.forEach(function (id) { if (!prev.has(id)) fresh.push(id); });
    seenIds = current;

    pendingRemoval.forEach(function (timer, id) {
      if (current.has(id)) {
        clearTimeout(timer);
        pendingRemoval.delete(id);
      }
    });

    if (vanished.length > Math.max(4, Math.floor(prev.size * 0.5))) return;

    var candidates = vanished.filter(function (id) { return !pendingRemoval.has(id); });
    var pairByName = candidates.length === 1 && fresh.length === 1 && current.size >= prev.size - 1;
    migrateRekey(candidates, fresh, pairByName).then(function (res) {
      var from = res.from || [];
      var to = res.to || [];
      candidates.forEach(function (id) {
        if (from.indexOf(id) >= 0) return;
        var timer = setTimeout(function () {
          pendingRemoval.delete(id);
          if (document.querySelector('a[href*="/chat/s/' + id + '"]')) return;
          syncRemoved(id);
        }, 6000);
        pendingRemoval.set(id, timer);
      });
      promptFresh(fresh.filter(function (id) { return to.indexOf(id) < 0; }));
    });
  }

  function scheduleReconcile() {
    if (reconcileTimer) return;
    reconcileTimer = setTimeout(function () {
      reconcileTimer = null;
      reconcile();
    }, 700);
  }

  /* 拖拽归类 */
  document.addEventListener("dragstart", function (evt) {
    var anchor = evt.target && evt.target.closest ? evt.target.closest(LINK_SELECTOR) : null;
    if (!anchor) return;
    var convId = convIdOf(anchor.getAttribute("href"));
    if (!convId) return;
    try { evt.dataTransfer.setData("text/plain", convId); } catch (err) { /* 忽略 */ }
    if (window.DSCMUI) window.DSCMUI.beginDrag({ id: convId, title: titleOf(anchor) });
  }, true);

  document.addEventListener("dragend", function () {
    if (window.DSCMUI) window.DSCMUI.endDrag();
  }, true);

  /* 右键归类 */
  document.addEventListener("contextmenu", function (evt) {
    var anchor = evt.target && evt.target.closest ? evt.target.closest(LINK_SELECTOR) : null;
    if (!anchor) return;
    var convId = convIdOf(anchor.getAttribute("href"));
    if (!convId) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (window.DSCMUI) {
      window.DSCMUI.showMoveMenu({ x: evt.clientX, y: evt.clientY, convId: convId, title: titleOf(anchor) });
    }
  }, true);

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function () {
      if (!enabled) return;
      if (!document.getElementById(ENTRY_ID)) scheduleInject();
      scheduleReconcile();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", scheduleInject);
    window.addEventListener("hashchange", scheduleInject);
    window.addEventListener("resize", function () { layoutGuard(); });
    setInterval(function () {
      if (!enabled) return;
      if (!document.getElementById(ENTRY_ID)) scheduleInject();
      layoutGuard();
    }, 2000);
  }

  function boot() {
    var store = window.DSCMStore;
    var ready = store && store.isEnabled ? store.isEnabled() : Promise.resolve(true);
    ready.then(function (on) {
      applyEnabled(on);
      startObserver();
      setTimeout(function () { reconcile(); }, 1600);
      window.DSCM = {
        inject: inject,
        teardown: teardown,
        enable: function (v) { applyEnabled(v); },
        openConversation: openConversation,
        lookupTitle: function (convId) {
          var anchor = document.querySelector('a[href*="/chat/s/' + convId + '"]');
          return anchor ? titleOf(anchor) : "";
        },
        reconcile: reconcile,
        diag: function () { return events.slice(); },
        syncTitles: function () { syncTitlesFromDom(true); },
        layoutGuard: layoutGuard,
        inspect: function () {
          var entry = document.getElementById(ENTRY_ID);
          var root = findListRoot();
          return {
            enabled: enabled,
            entry: !!entry,
            marginTop: entry ? entry.style.marginTop : null,
            entryParent: entry && entry.parentElement ? entry.parentElement.className : null,
            isFirstChild: !!(entry && entry.parentElement && entry.parentElement.firstElementChild === entry),
            links: convLinks().length,
            listRoot: root ? root.className : null
          };
        }
      };
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area !== "local" || !changes[store.ENABLED_KEY]) return;
          applyEnabled(changes[store.ENABLED_KEY].newValue !== false);
        });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
