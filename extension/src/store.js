/* 本地数据层：优先 chrome.storage.local；没有扩展环境时退回 localStorage（用于本地预览） */
(function () {
  "use strict";

  var KEY = "dscm.data.v1";
  var ENABLED_KEY = "dscm.enabled";
  var hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  var listeners = new Set();

  function normalize(raw) {
    var d = raw && typeof raw === "object" ? raw : {};

    var folders = Array.isArray(d.folders) ? d.folders.map(function (f, i) {
      if (!f || typeof f.id !== "string" || typeof f.name !== "string") return null;
      return {
        id: f.id,
        name: f.name,
        order: typeof f.order === "number" ? f.order : i,
        pinned: !!f.pinned,
        createdAt: f.createdAt || 0
      };
    }).filter(Boolean) : [];
    folders.sort(function (a, b) { return a.order - b.order; });

    var membership = {};
    var rawM = d.membership && typeof d.membership === "object" ? d.membership : {};
    var oldTitles = d.titles && typeof d.titles === "object" ? d.titles : {};
    Object.keys(rawM).forEach(function (convId) {
      var v = rawM[convId];
      if (typeof v === "string") {
        membership[convId] = { folderId: v, title: oldTitles[convId] || "", addedAt: 0 };
      } else if (v && typeof v.folderId === "string") {
        membership[convId] = {
          folderId: v.folderId,
          title: typeof v.title === "string" ? v.title : "",
          addedAt: typeof v.addedAt === "number" ? v.addedAt : 0
        };
      }
    });

    var rawSettings = d.settings && typeof d.settings === "object" ? d.settings : {};
    var settings = { promptNew: rawSettings.promptNew !== false };

    return { folders: folders, membership: membership, settings: settings };
  }

  function chromeGet(key) {
    return new Promise(function (resolve, reject) {
      var maybe;
      try {
        maybe = chrome.storage.local.get(key);
      } catch (err) {
        reject(err);
        return;
      }
      if (maybe && typeof maybe.then === "function") maybe.then(resolve, reject);
      else chrome.storage.local.get(key, resolve);
    });
  }

  function read() {
    if (hasChrome) {
      return chromeGet(KEY).then(function (res) { return normalize(res && res[KEY]); });
    }
    try {
      return Promise.resolve(normalize(JSON.parse(localStorage.getItem(KEY) || "null")));
    } catch (err) {
      return Promise.resolve(normalize(null));
    }
  }

  function write(data) {
    var clean = normalize(data);
    var done;
    if (hasChrome) {
      var payload = {};
      payload[KEY] = clean;
      done = chrome.storage.local.set(payload);
    } else {
      localStorage.setItem(KEY, JSON.stringify(clean));
      done = Promise.resolve();
    }
    return Promise.resolve(done).then(function () {
      listeners.forEach(function (fn) {
        try { fn(clean); } catch (err) { /* 忽略 */ }
      });
      return clean;
    });
  }

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function isEnabled() {
    if (!hasChrome) return Promise.resolve(true);
    return chromeGet(ENABLED_KEY).then(function (res) {
      return res && typeof res[ENABLED_KEY] === "boolean" ? res[ENABLED_KEY] : true;
    });
  }

  function setEnabled(on) {
    if (!hasChrome) return Promise.resolve(on);
    var payload = {};
    payload[ENABLED_KEY] = !!on;
    return chrome.storage.local.set(payload);
  }

  function sortedFolders(data) {
    return (data.folders || []).slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (a.order || 0) - (b.order || 0);
    });
  }

  function countOf(data, folderId) {
    var n = 0;
    var map = (data && data.membership) || {};
    Object.keys(map).forEach(function (convId) {
      if (map[convId] && map[convId].folderId === folderId) n += 1;
    });
    return n;
  }

  function itemsOf(data, folderId) {
    var map = (data && data.membership) || {};
    return Object.keys(map)
      .filter(function (convId) { return map[convId] && map[convId].folderId === folderId; })
      .map(function (convId) {
        return {
          convId: convId,
          title: map[convId].title || "未命名对话",
          addedAt: map[convId].addedAt || 0
        };
      })
      .sort(function (a, b) { return b.addedAt - a.addedAt; });
  }

  function folderOf(data, convId) {
    var entry = data && data.membership ? data.membership[convId] : null;
    return entry ? entry.folderId : null;
  }

  function addFolder(name) {
    return read().then(function (data) {
      var clean = String(name || "").trim().replace(/\s+/g, " ").slice(0, 24);
      if (!clean) throw new Error("文件夹名称不能为空");
      var exists = data.folders.some(function (f) { return f.name === clean; });
      if (exists) throw new Error("已经有同名文件夹了");
      var maxOrder = data.folders.reduce(function (m, f) { return Math.max(m, f.order || 0); }, -1);
      var folder = { id: uid("f"), name: clean, order: maxOrder + 1, pinned: false, createdAt: Date.now() };
      data.folders.push(folder);
      return write(data).then(function () { return folder; });
    });
  }

  function renameFolder(id, name) {
    return read().then(function (data) {
      var clean = String(name || "").trim().slice(0, 24);
      if (!clean) throw new Error("文件夹名称不能为空");
      var dup = data.folders.some(function (f) { return f.id !== id && f.name === clean; });
      if (dup) throw new Error("已经有同名文件夹了");
      data.folders.forEach(function (f) { if (f.id === id) f.name = clean; });
      return write(data);
    });
  }

  function togglePin(id) {
    return read().then(function (data) {
      data.folders.forEach(function (f) { if (f.id === id) f.pinned = !f.pinned; });
      return write(data);
    });
  }

  function moveFolder(id, dir) {
    return read().then(function (data) {
      var list = data.folders.slice().sort(function (a, b) { return a.order - b.order; });
      var index = -1;
      for (var i = 0; i < list.length; i += 1) { if (list[i].id === id) { index = i; break; } }
      if (index < 0) return data;
      var target = index + dir;
      if (target < 0 || target >= list.length) return data;
      var a = list[index];
      var b = list[target];
      var tmp = a.order;
      a.order = b.order;
      b.order = tmp;
      return write(data);
    });
  }

  function removeFolder(id) {
    return read().then(function (data) {
      data.folders = data.folders.filter(function (f) { return f.id !== id; });
      data.folders.sort(function (a, b) { return a.order - b.order; });
      data.folders.forEach(function (f, i) { f.order = i; });
      Object.keys(data.membership).forEach(function (convId) {
        if (data.membership[convId].folderId === id) delete data.membership[convId];
      });
      return write(data);
    });
  }

  function assign(convId, folderId, title) {
    if (!convId || !folderId) return Promise.reject(new Error("参数不完整"));
    return read().then(function (data) {
      var exists = data.folders.some(function (f) { return f.id === folderId; });
      if (!exists) throw new Error("文件夹不存在");
      data.membership[convId] = {
        folderId: folderId,
        title: String(title || "").trim().slice(0, 200) || "未命名对话",
        addedAt: Date.now()
      };
      return write(data);
    });
  }

  function unassign(convId) {
    return read().then(function (data) {
      delete data.membership[convId];
      return write(data);
    });
  }

  /* 用原生列表里的真实标题刷新本地记录；返回是否有变化 */
  function syncTitles(map) {
    return read().then(function (data) {
      var changed = false;
      Object.keys(map || {}).forEach(function (convId) {
        var entry = data.membership[convId];
        var title = map[convId];
        if (entry && title && entry.title !== title) {
          entry.title = title;
          changed = true;
        }
      });
      if (!changed) return false;
      return write(data).then(function () { return true; });
    });
  }

  function setSetting(key, value) {
    return read().then(function (data) {
      data.settings[key] = value;
      return write(data);
    });
  }

  function importData(obj) {
    if (!obj || typeof obj !== "object" || (!Array.isArray(obj.folders) && !obj.membership)) {
      return Promise.reject(new Error("不是有效的备份文件"));
    }
    return write(obj);
  }

  window.DSCMStore = {
    KEY: KEY,
    ENABLED_KEY: ENABLED_KEY,
    read: read,
    write: write,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    sortedFolders: sortedFolders,
    countOf: countOf,
    itemsOf: itemsOf,
    folderOf: folderOf,
    addFolder: addFolder,
    renameFolder: renameFolder,
    togglePin: togglePin,
    moveFolder: moveFolder,
    removeFolder: removeFolder,
    assign: assign,
    unassign: unassign,
    syncTitles: syncTitles,
    setSetting: setSetting,
    importData: importData,
    subscribe: function (fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    }
  };
})();
