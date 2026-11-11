/* 点扩展图标 = 显示 / 隐藏侧栏入口（不弹小窗，零额外页面） */
var ENABLED_KEY = "dscm.enabled";

function paint(on) {
  chrome.action.setBadgeText({ text: on ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#8a8f98" });
  chrome.action.setTitle({ title: on ? "点击隐藏「对话文件夹」" : "点击显示「对话文件夹」" });
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(ENABLED_KEY).then(function (res) {
    if (typeof res[ENABLED_KEY] !== "boolean") {
      var payload = {};
      payload[ENABLED_KEY] = true;
      return chrome.storage.local.set(payload).then(function () { paint(true); });
    }
    paint(res[ENABLED_KEY]);
  });
});

chrome.action.onClicked.addListener(function () {
  chrome.storage.local.get(ENABLED_KEY).then(function (res) {
    var next = !(res[ENABLED_KEY] === true || res[ENABLED_KEY] === undefined);
    var payload = {};
    payload[ENABLED_KEY] = next;
    return chrome.storage.local.set(payload).then(function () { paint(next); });
  });
});
