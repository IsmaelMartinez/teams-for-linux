const profileList = document.getElementById("profile-list");
const errorMessage = document.getElementById("error-message");
const closeBtn = document.getElementById("close-btn");

// Mirrors the maxlength on Add-profile's name input. Server-side trim+empty
// check lives in ProfilesManager.#applyName; this client cap is just to
// keep the UI from accepting absurd lengths into the Settings store.
const NAME_MAX_LENGTH = 64;

let currentState = { profiles: [], activeId: null };
let editingId = null;

function clearError() {
  errorMessage.textContent = "";
}

function setError(message) {
  errorMessage.textContent = message;
}

function makeAvatar(profile) {
  const avatar = document.createElement("span");
  avatar.className = "profile-avatar";
  if (profile.avatarColor) {
    avatar.style.backgroundColor = profile.avatarColor;
  }
  avatar.textContent = profile.avatarInitials || "";
  return avatar;
}

function makeNameElement(profile) {
  if (editingId === profile.id) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "profile-name-input";
    input.value = profile.name;
    input.maxLength = NAME_MAX_LENGTH;
    input.dataset.profileId = profile.id;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitRename(profile.id, input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelRename();
      }
    });
    input.addEventListener("blur", () => {
      // Only treat blur as save if we're still in edit mode for this id —
      // commitRename / cancelRename clear editingId synchronously.
      if (editingId === profile.id) {
        commitRename(profile.id, input.value);
      }
    });

    return input;
  }

  const span = document.createElement("span");
  span.className = "profile-name";
  span.textContent = profile.name;
  span.tabIndex = 0;
  span.title = "Click to rename";
  span.addEventListener("click", () => beginRename(profile.id));
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      beginRename(profile.id);
    }
  });
  return span;
}

function beginRename(id) {
  if (editingId === id) return;
  editingId = id;
  clearError();
  render();
  const input = profileList.querySelector(
    `.profile-name-input[data-profile-id="${id}"]`
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

function commitRename(id, raw) {
  const trimmed = raw.trim();
  const profile = currentState.profiles.find((p) => p.id === id);
  if (!profile) {
    cancelRename();
    return;
  }
  if (!trimmed) {
    setError("Profile name cannot be empty.");
    // Keep the input open so the user can correct without re-entering edit.
    return;
  }
  if (trimmed === profile.name) {
    cancelRename();
    return;
  }
  // Optimistic close — main process re-pushes state on success, or returns
  // an error via `manage-profile-error` if validation rejects.
  editingId = null;
  globalThis.manageProfileApi.rename(id, trimmed);
}

function makeRemoveButton(profile, isActive, isLastRemaining) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "profile-remove-btn";
  btn.textContent = "Remove";
  if (isActive) {
    btn.disabled = true;
    btn.title = "Active profile cannot be removed — switch to another first";
  } else if (isLastRemaining) {
    btn.disabled = true;
    btn.title = "Cannot remove the last profile";
  } else {
    btn.addEventListener("click", () => {
      globalThis.manageProfileApi.remove(profile.id);
    });
  }
  return btn;
}

function render() {
  profileList.replaceChildren();
  const total = currentState.profiles.length;
  for (const profile of currentState.profiles) {
    const li = document.createElement("li");
    li.className = "profile-row";
    const isActive = profile.id === currentState.activeId;
    if (isActive) {
      li.classList.add("active");
    }
    li.append(makeAvatar(profile));
    li.append(makeNameElement(profile));
    if (isActive) {
      const badge = document.createElement("span");
      badge.className = "profile-active-badge";
      badge.textContent = "Active";
      li.append(badge);
    }
    li.append(makeRemoveButton(profile, isActive, total === 1));
    profileList.append(li);
  }
}

closeBtn.addEventListener("click", () => {
  globalThis.manageProfileApi.close();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editingId === null) {
    globalThis.manageProfileApi.close();
  }
});

globalThis.manageProfileApi.onState((state) => {
  currentState = state;
  // If the profile we were editing was removed externally, drop edit state.
  if (editingId && !state.profiles.some((p) => p.id === editingId)) {
    editingId = null;
  }
  render();
});

globalThis.manageProfileApi.onError((message) => {
  setError(message);
});

render();
