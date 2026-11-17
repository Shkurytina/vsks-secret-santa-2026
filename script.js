"use strict";

// Публичные параметры проекта. Не добавляйте сюда секретные ключи или пароли.
const CONFIG = Object.freeze({
  projectUrl: "https://lwdjiucfeworweikgxq.supabase.co",
  publishableKey: "sb_publishable_C67Iu68TtyyBBSCQ-rQj9g_yCxXzDdH",
  functionName: "santa-api",
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
let adminPassword = ""; // Только в памяти текущей вкладки, не сохраняем.
let activeTab = "join";
let busy = false;
let currentToken = "";
let adminParticipants = [];
let adminDrawn = false;

function showMessage(message, isError = false) {
  const node = $("#inlineMessage");
  node.textContent = message;
  node.style.color = isError ? "#a74238" : "#245446";
  node.classList.remove("hidden");
}
function clearMessage() { $("#inlineMessage").classList.add("hidden"); }
function setBusy(value) {
  busy = value;
  $$("#game button").forEach((button) => {
    if (button.classList.contains("tab")) return;
    button.disabled = value;
  });
}
async function api(action, params = {}) {
  const response = await fetch(`${CONFIG.projectUrl}/functions/v1/${CONFIG.functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": CONFIG.publishableKey,
    },
    body: JSON.stringify({ action, ...params }),
    cache: "no-store",
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Ошибка ответа сервера (HTTP ${response.status})`); }
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}
async function run(work) {
  if (busy) return;
  clearMessage();
  setBusy(true);
  try { await work(); }
  catch (error) { showMessage(error instanceof Error ? error.message : "Неизвестная ошибка", true); }
  finally { setBusy(false); }
}
function switchTab(name) {
  activeTab = name;
  $$(".tab").forEach((node) => {
    const selected = node.dataset.tab === name;
    node.classList.toggle("active", selected);
    node.setAttribute("aria-selected", String(selected));
  });
  $$(".tab-content").forEach((node) => node.classList.toggle("active", node.id === name));
  clearMessage();
}
$$(".tab").forEach((node) => node.addEventListener("click", () => switchTab(node.dataset.tab)));

async function refreshStatus() {
  try {
    const result = await api("status");
    $("#participantCount").textContent = result.count ?? 0;
    $("#gameStatus").textContent = result.drawn
      ? "Жеребьёвка проведена"
      : result.registrationOpen ? "Регистрация открыта" : "Регистрация закрыта";
    $("#registrationStatus").textContent = result.drawn
      ? "Результаты доступны по ссылкам"
      : result.registrationOpen ? "Присоединяйся!" : "Приём анкет завершён";
    $("#joinButton").disabled = !result.registrationOpen || !!result.drawn;
    if (!result.registrationOpen || result.drawn) {
      $("#joinFormArea").classList.add("hidden");
    }
  } catch (error) {
    $("#gameStatus").textContent = "Не удалось связаться с сервером";
    $("#registrationStatus").textContent = "Ошибка подключения";
    showMessage(`Не удалось получить статус: ${error.message}`, true);
  }
}

function tokenFromHash() {
  // Фрагмент URL (#...) не передаётся на сервер при загрузке страницы.
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("token") || "";
  return /^[a-f0-9]{64}$/i.test(token) ? token.toLowerCase() : "";
}
function tokenFromInput(value) {
  const raw = value.trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) return raw.toLowerCase();
  try {
    const url = new URL(raw);
    const token = new URLSearchParams(url.hash.slice(1)).get("token") || "";
    return /^[a-f0-9]{64}$/i.test(token) ? token.toLowerCase() : "";
  } catch { return ""; }
}
function personalLink(token) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
function textElement(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}

$("#participantForm").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const password = $("#gamePassword").value;
    const fullName = $("#name").value.trim().replace(/\s+/g, " ");
    const wishes = $("#wish").value.trim();
    if (!password || fullName.length < 2) throw new Error("Укажи пароль и своё имя.");
    const result = await api("register", { password, fullName, wishes });
    const token = result.token;
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Сервер не вернул персональный код.");
    currentToken = token;
    $("#gamePassword").value = "";
    $("#joinFormArea").classList.add("hidden");
    $("#registrationSuccess").classList.remove("hidden");
    $("#personalUrl").value = personalLink(token);
    $("#personalToken").value = token;
    history.replaceState(null, "", `${location.pathname}${location.search}#${new URLSearchParams({ token })}`);
    showMessage("Регистрация прошла успешно. Обязательно сохрани персональную ссылку!");
    await refreshStatus();
  });
});

$("#copyPersonalUrl").addEventListener("click", () => run(async () => {
  const link = $("#personalUrl").value;
  try { await navigator.clipboard.writeText(link); }
  catch {
    $("#personalUrl").focus();
    $("#personalUrl").select();
    throw new Error("Автокопирование недоступно. Скопируй выделенную ссылку вручную.");
  }
  showMessage("Ссылка скопирована. Сохрани её в надёжном месте.");
}));
$("#goToResult").addEventListener("click", () => {
  switchTab("reveal");
  $("#personalToken").value = currentToken;
  $("#revealButton").click();
});

async function reveal() {
  await run(async () => {
    const token = tokenFromInput($("#personalToken").value) || tokenFromHash();
    if (!token) throw new Error("Вставь действительную персональную ссылку или код.");
    currentToken = token;
    const data = await api("my-result", { token });
    const result = $("#revealResult");
    result.replaceChildren();
    result.append(textElement("span", "tiny", `Участник: ${data.name}`));
    if (!data.drawn) {
      result.append(textElement("div", "recipient", "Пока секрет ✦"));
      result.append(textElement("p", "wish", "Жеребьёвка ещё не состоялась. Возвращайся по этой же ссылке позже."));
    } else {
      result.append(textElement("span", "tiny", "Ты готовишь подарок для"));
      result.append(textElement("div", "recipient", data.recipient?.full_name || "Участник"));
      result.append(textElement("p", "wish", data.recipient?.wishes
        ? `Пожелания: ${data.recipient.wishes}`
        : "Пожелания не указаны. Время включать фантазию!"));
    }
    result.classList.remove("hidden");
  });
}
$("#revealButton").addEventListener("click", reveal);

async function refreshAdmin() {
  const data = await api("admin-list", { adminPassword });
  adminParticipants = data.participants;
  adminDrawn = !!data.settings.draw_completed_at;
  $("#adminCount").textContent = adminParticipants.length;
  $("#adminGameStatus").textContent = adminDrawn
    ? "Жеребьёвка завершена. Редактирование списка недоступно."
    : data.settings.registration_open ? "Регистрация открыта." : "Регистрация закрыта.";
  $("#closeRegistration").textContent = data.settings.registration_open ? "Закрыть регистрацию" : "Открыть регистрацию";
  $("#closeRegistration").disabled = adminDrawn;
  $("#drawButton").disabled = adminDrawn || adminParticipants.length < 3;
  $("#exportCsv").disabled = !adminParticipants.length;
  $("#drawConfirm").textContent = `В жеребьёвке будут участвовать ${adminParticipants.length} человек.`;

  const list = $("#adminParticipants");
  list.replaceChildren();
  if (!adminParticipants.length) list.append(textElement("div", "notice", "Пока нет участников."));

  for (const p of adminParticipants) {
    const item = textElement("div", "participant-item", "");
    const content = document.createElement("div");
    content.append(textElement("strong", "", p.full_name));
    content.append(textElement("p", "", p.wishes || "Пожелания не указаны"));
    item.append(content);
    if (!adminDrawn) {
      const actions = textElement("div", "participant-actions", "");
      const edit = textElement("button", "text-button", "Изменить");
      edit.type = "button";
      edit.addEventListener("click", () => openEditor(p));
      const del = textElement("button", "text-button danger", "Удалить");
      del.type = "button";
      del.addEventListener("click", () => removeParticipant(p));
      actions.append(edit, del);
      item.append(actions);
    }
    list.append(item);
  }
}

function openEditor(p) {
  $("#editId").value = p.id;
  $("#editName").value = p.full_name;
  $("#editWish").value = p.wishes;
  $("#editDialog").showModal();
}
$("#editForm").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const id = $("#editId").value;
    const fullName = $("#editName").value.trim().replace(/\s+/g, " ");
    const wishes = $("#editWish").value.trim();
    if (fullName.length < 2) throw new Error("Укажи имя участника.");
    await api("admin-update", { adminPassword, id, fullName, wishes });
    $("#editDialog").close();
    await refreshAdmin();
    showMessage("Анкета изменена.");
  });
});
$("#editCancel").addEventListener("click", () => $("#editDialog").close());

function removeParticipant(p) {
  if (!confirm(`Удалить участника «${p.full_name}»? Его персональная ссылка перестанет работать.`)) return;
  run(async () => {
    await api("admin-delete", { adminPassword, id: p.id });
    await refreshAdmin();
    await refreshStatus();
    showMessage("Участник удалён.");
  });
}

function csvCell(value) {
  // Защита от формульной инъекции при открытии в Excel/Sheets.
  const s = String(value ?? "").replace(/^\s*[=+@\-\t\r]/, (s) => "'" + s);
  return '"' + s.replaceAll('"', '""') + '"';
}
$("#exportCsv").addEventListener("click", () => {
  const rows = [
    ["ФИО", "Пожелания", "Дата регистрации"],
    ...adminParticipants.map((p) => [p.full_name, p.wishes, p.created_at]),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "vsks-secret-santa-2026-participants.csv";
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showMessage("Список участников сохранён в CSV.");
});

$("#adminForm").addEventListener("submit", (event) => {
  event.preventDefault();
  run(async () => {
    const candidate = $("#adminPassword").value;
    if (!candidate) throw new Error("Укажи пароль организатора.");
    adminPassword = candidate;
    try { await refreshAdmin(); }
    catch (error) { adminPassword = ""; throw error; }
    $("#adminPassword").value = "";
    $("#adminGate").classList.add("hidden");
    $("#adminPanel").classList.remove("hidden");
  });
});
$("#refreshAdmin").addEventListener("click", () => run(async () => { await refreshAdmin(); showMessage("Список обновлён."); }));
$("#closeRegistration").addEventListener("click", () => {
  const opening = $("#closeRegistration").textContent.includes("Открыть");
  const question = opening
    ? "Снова открыть регистрацию для новых участников?"
    : "Закрыть регистрацию? Новые участники не смогут зарегистрироваться.";
  if (!confirm(question)) return;
  run(async () => {
    await api(opening ? "admin-open" : "admin-close", { adminPassword });
    await refreshAdmin();
    await refreshStatus();
    showMessage(opening ? "Регистрация открыта." : "Регистрация закрыта.");
  });
});
$("#drawButton").addEventListener("click", () => {
  $("#drawApproval").checked = false;
  $("#drawDialog").showModal();
});
$("#drawCancel").addEventListener("click", () => $("#drawDialog").close());
$("#drawForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!$("#drawApproval").checked) return;
  $("#drawDialog").close();
  run(async () => {
    const result = await api("admin-draw", { adminPassword, confirm: "DRAW-2026" });
    await refreshAdmin();
    await refreshStatus();
    showMessage(`Жеребьёвка проведена! Распределено участников: ${result.count}.`);
  });
});
$("#adminLogout").addEventListener("click", () => {
  adminPassword = "";
  $("#adminPanel").classList.add("hidden");
  $("#adminGate").classList.remove("hidden");
  clearMessage();
});

function updateCountdown() {
  const target = new Date("2027-01-01T00:00:00+03:00");
  const diff = target - new Date();
  if (diff <= 0) { $("#countdown").textContent = "С Новым годом!"; return; }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  $("#countdown").textContent = `${days} дн. · ${hours} ч. · ${minutes} мин.`;
}
updateCountdown();
setInterval(updateCountdown, 60000);
refreshStatus();
if (tokenFromHash()) {
  currentToken = tokenFromHash();
  $("#personalToken").value = currentToken;
  switchTab("reveal");
  reveal();
}
