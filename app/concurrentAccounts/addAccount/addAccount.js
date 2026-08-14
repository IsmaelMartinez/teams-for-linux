const nameInput = document.getElementById("name-input");
const addBtn = document.getElementById("add-btn");
const cancelBtn = document.getElementById("cancel-btn");
const errorMessage = document.getElementById("error-message");

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

function handleSubmit() {
  if (addBtn.disabled) return;
  clearError();
  globalThis.addAccountApi.submit({ name: nameInput.value.trim() });
}

function handleCancel() {
  globalThis.addAccountApi.cancel();
}

nameInput.addEventListener("input", () => {
  clearError();
  updateValidation();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !addBtn.disabled) {
    handleSubmit();
  } else if (e.key === "Escape") {
    handleCancel();
  }
});

addBtn.addEventListener("click", handleSubmit);
cancelBtn.addEventListener("click", handleCancel);

globalThis.addAccountApi.onError((message) => {
  errorMessage.textContent = message;
});

updateValidation();
nameInput.focus();
