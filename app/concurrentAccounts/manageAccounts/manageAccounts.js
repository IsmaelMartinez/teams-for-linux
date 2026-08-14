const accountList = document.getElementById("account-list");
const errorMessage = document.getElementById("error-message");
const closeBtn = document.getElementById("close-btn");

const NAME_MAX_LENGTH = 64;

let currentState = { accounts: [], max: 3 };
let editingId = null;

function clearError() {
  errorMessage.textContent = "";
}

function setError(message) {
  errorMessage.textContent = message;
}

function guardFocus(btn) {
  btn.addEventListener("mousedown", (e) => e.preventDefault());
}

function makeNameElement(account) {
  if (editingId === account.id) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "account-name-input";
    input.value = account.label || account.name;
    input.maxLength = NAME_MAX_LENGTH;
    input.dataset.accountId = account.id;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commitRename(account.id, input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelRename();
      }
    });
    input.addEventListener("blur", () => {
      if (editingId === account.id) {
        commitRename(account.id, input.value);
      }
    });
    return input;
  }

  const span = document.createElement("span");
  span.className = "account-name";
  span.textContent = account.label || account.name;
  span.tabIndex = 0;
  span.title = "Click to rename";
  span.addEventListener("click", () => beginRename(account.id));
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      beginRename(account.id);
    }
  });
  return span;
}

function beginRename(id) {
  if (editingId === id) return;
  editingId = id;
  clearError();
  render();
  const input = accountList.querySelector(
    `.account-name-input[data-account-id="${id}"]`
  );
  if (input) {
    input.focus();
    input.select();
  }
}

function cancelRename() {
  editingId = null;
  clearError();
  render();
}

async function commitRename(id, raw) {
  const trimmed = raw.trim();
  const account = currentState.accounts.find((entry) => entry.id === id);
  if (!account) {
    cancelRename();
    return;
  }
  if (!trimmed) {
    setError("Account name cannot be empty.");
    return;
  }
  if (trimmed === account.name || trimmed === account.label) {
    cancelRename();
    return;
  }
  try {
    await globalThis.manageAccountsApi.rename(id, trimmed);
    editingId = null;
    clearError();
    render();
  } catch (error) {
    setError(error?.message || "Failed to rename account.");
    const input = accountList.querySelector(
      `.account-name-input[data-account-id="${id}"]`
    );
    input?.focus();
  }
}

function makeOpenButton(account) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "account-open-btn";
  btn.textContent = "Open";
  if (account.isCurrent) {
    btn.disabled = true;
    btn.title = "This window";
  } else {
    guardFocus(btn);
    btn.addEventListener("click", () => {
      clearError();
      globalThis.manageAccountsApi.open(account.id);
    });
  }
  return btn;
}

function makeRemoveButton(account) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "account-remove-btn";
  btn.textContent = "Remove";
  if (account.isHome) {
    btn.disabled = true;
    btn.title = "The original account cannot be removed";
  } else if (account.isCurrent) {
    btn.disabled = true;
    btn.title = "Cannot remove the account that is currently running";
  } else if (account.isRunning) {
    btn.disabled = true;
    btn.title = "Quit that account first, then remove it";
  } else {
    guardFocus(btn);
    btn.addEventListener("click", () => {
      globalThis.manageAccountsApi.remove(account.id);
    });
  }
  return btn;
}

function render() {
  accountList.replaceChildren();
  for (const account of currentState.accounts) {
    const li = document.createElement("li");
    li.className = "account-row";
    if (account.isCurrent) {
      li.classList.add("current");
    }
    li.append(makeNameElement(account));
    if (account.isCurrent) {
      const badge = document.createElement("span");
      badge.className = "account-current-badge";
      badge.textContent = "This window";
      li.append(badge);
    } else if (account.isRunning) {
      const badge = document.createElement("span");
      badge.className = "account-running-badge";
      badge.textContent = "Running";
      li.append(badge);
    }
    li.append(makeOpenButton(account));
    li.append(makeRemoveButton(account));
    accountList.append(li);
  }
}

closeBtn.addEventListener("click", () => {
  globalThis.manageAccountsApi.close();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editingId === null) {
    globalThis.manageAccountsApi.close();
  }
});

globalThis.manageAccountsApi.onState((state) => {
  currentState = state;
  if (editingId && !state.accounts.some((entry) => entry.id === editingId)) {
    editingId = null;
  }
  render();
});

globalThis.manageAccountsApi.onError((message) => {
  setError(message);
});

render();
