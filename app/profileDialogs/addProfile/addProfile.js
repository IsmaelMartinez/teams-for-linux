const nameInput = document.getElementById("name-input");
const urlInput = document.getElementById("url-input");
const initialsInput = document.getElementById("initials-input");
const colorInput = document.getElementById("color-input");
const addBtn = document.getElementById("add-btn");
const cancelBtn = document.getElementById("cancel-btn");
const errorMessage = document.getElementById("error-message");

// Defer "color was customised" until the user actually picks one. Submitting
// the default value would force every profile to share the same colour and
// defeat the auto-derive in ProfilesManager.
let colorWasTouched = false;

function updateValidation() {
  const hasName = nameInput.value.trim().length > 0;
  addBtn.disabled = !hasName;
  if (hasName) {
    nameInput.classList.remove("invalid");
  } else {
    nameInput.classList.add("invalid");
  }
}

function clearError() {
  errorMessage.textContent = "";
}

function buildRecord() {
  const record = {
    name: nameInput.value.trim(),
  };
  const url = urlInput.value.trim();
  if (url) record.url = url;
  const initials = initialsInput.value.trim();
  if (initials) record.avatarInitials = initials;
  if (colorWasTouched) record.avatarColor = colorInput.value;
  return record;
}

function handleSubmit() {
  if (addBtn.disabled) return;
  clearError();
  globalThis.addProfileApi.submit(buildRecord());
}

function handleCancel() {
  globalThis.addProfileApi.cancel();
}

nameInput.addEventListener("input", () => {
  clearError();
  updateValidation();
});
urlInput.addEventListener("input", clearError);
initialsInput.addEventListener("input", clearError);
colorInput.addEventListener("input", () => {
  colorWasTouched = true;
  clearError();
});

[nameInput, urlInput, initialsInput].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !addBtn.disabled) {
      handleSubmit();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  });
});

addBtn.addEventListener("click", handleSubmit);
cancelBtn.addEventListener("click", handleCancel);

globalThis.addProfileApi.onError((message) => {
  errorMessage.textContent = message;
});

updateValidation();
nameInput.focus();
