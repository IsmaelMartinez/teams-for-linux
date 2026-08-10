const profileList = document.getElementById("profile-list");
const errorMessage = document.getElementById("error-message");
const closeBtn = document.getElementById("close-btn");

// Mirrors the maxlength on Add-profile's name input. Server-side trim+empty
// check lives in ProfilesManager.#applyName; this client cap is just to
// keep the UI from accepting absurd lengths into the Settings store.
const NAME_MAX_LENGTH = 64;

let currentState = { profiles: [], activeId: null, shortcutsAvailable: false };
let editingId = null;
// Profile id whose pin button should regain focus after the next render —
// toggling a pin rebuilds the list, which would otherwise drop keyboard
// focus to <body>.
let focusAfterRender = null;

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
        e.stopPropagation();
        commitRename(profile.id, input.value);
      } else if (e.key === "Escape") {
        // stopPropagation prevents the event bubbling to the document-level
        // Esc handler, which would otherwise see editingId === null after
        // cancelRename() and close the dialog (HIGH-priority gemini finding
        // on PR #2510).
        e.preventDefault();
        e.stopPropagation();
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

async function commitRename(id, raw) {
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
  try {
    await globalThis.manageProfileApi.rename(id, trimmed);
    // Success — exit edit mode. The state push from main will refresh the
    // rendered row shortly; clearing editingId now keeps the UX snappy.
    editingId = null;
    clearError();
    render();
  } catch (error) {
    // Backend rejected the rename. Keep the input open so the user can
    // correct without re-typing; show the message and refocus the input.
    setError(error?.message || "Failed to rename profile.");
    const input = profileList.querySelector(
      `.profile-name-input[data-profile-id="${id}"]`
    );
    input?.focus();
  }
}

// Mirrors MAX_PINNED in ProfilesManager (the Ctrl+Alt+1…5 shortcut slots).
// Main enforces the cap authoritatively; this just disables the button so the
// user isn't offered an action that would be rejected.
const MAX_PINNED = 5;

// Guard focus against the rename input's blur-commit: without this, pressing
// a row button while a rename is open blurs the input, which commits and
// re-renders synchronously — detaching the pressed button between mousedown
// and mouseup so Chromium drops the click entirely.
function guardFocus(btn) {
  btn.addEventListener("mousedown", (e) => e.preventDefault());
}

function makePinButton(profile, pinnedCount, slot) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "profile-pin-btn" + (profile.pinned ? " pinned" : "");
  btn.dataset.profileId = profile.id;
  btn.setAttribute("aria-pressed", String(!!profile.pinned));
  // Only show the chord when it can actually fire (the accelerator lives on
  // the per-window menu, absent on macOS — main tells us via state).
  const chord = currentState.shortcutsAvailable ? `Ctrl+Alt+${slot}` : null;
  if (profile.pinned) {
    btn.textContent = chord ? `Unpin (${chord})` : "Unpin";
    btn.title = chord ? `Pinned — switch with ${chord}` : "Pinned";
  } else {
    btn.textContent = "Pin";
    if (pinnedCount >= MAX_PINNED) {
      btn.disabled = true;
      btn.title = `At most ${MAX_PINNED} profiles can be pinned`;
    } else {
      btn.title = currentState.shortcutsAvailable
        ? "Pin for a Ctrl+Alt keyboard shortcut"
        : "Pin this profile";
    }
  }
  if (!btn.disabled) {
    guardFocus(btn);
    btn.addEventListener("click", async () => {
      clearError();
      // Remember where focus should land after the state push re-renders the
      // list — set BEFORE the await, since the push can arrive first.
      focusAfterRender = profile.id;
      try {
        const result = await globalThis.manageProfileApi.pin(
          profile.id,
          !profile.pinned
        );
        if (result?.ok === false) {
          // Rejected (e.g. the max-5 cap): no state push follows, so render()
          // won't run — clear the pending focus target or the next unrelated
          // render would yank focus onto this button.
          focusAfterRender = null;
          setError(result.error || "Failed to update pin.");
        }
      } catch (error) {
        focusAfterRender = null;
        setError(error?.message || "Failed to update pin.");
      }
    });
  }
  return btn;
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
    guardFocus(btn);
    btn.addEventListener("click", () => {
      globalThis.manageProfileApi.remove(profile.id);
    });
  }
  return btn;
}

function render() {
  profileList.replaceChildren();
  const total = currentState.profiles.length;
  const pinnedCount = currentState.profiles.filter((p) => p.pinned).length;
  // Slot numbers mirror the menu accelerators: 1-based position among the
  // pinned profiles in list order (see app/menus/profilesMenu.js).
  let nextSlot = 0;
  for (const profile of currentState.profiles) {
    const li = document.createElement("li");
    li.className = "profile-row";
    const isActive = profile.id === currentState.activeId;
    if (isActive) {
      li.classList.add("active");
    }
    const slot = profile.pinned ? ++nextSlot : null;
    li.append(makeAvatar(profile));
    li.append(makeNameElement(profile));
    if (isActive) {
      const badge = document.createElement("span");
      badge.className = "profile-active-badge";
      badge.textContent = "Active";
      li.append(badge);
    }
    li.append(makePinButton(profile, pinnedCount, slot));
    li.append(makeRemoveButton(profile, isActive, total === 1));
    profileList.append(li);
  }
  if (focusAfterRender) {
    const btn = profileList.querySelector(
      `.profile-pin-btn[data-profile-id="${focusAfterRender}"]`
    );
    focusAfterRender = null;
    btn?.focus();
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
