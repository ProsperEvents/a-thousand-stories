const DEFAULT_STORY_QUESTIONS = [
  "What is your full name, age, and city of residence.",
  "Tell me the story of how exactly you ended up here today. Where you were born, where you grew up, moved to, who was involved in your story, your path to this exact moment.",
  "What is your greatest accomplishment?",
  "What is your greatest regret?",
  "What is your favourite thing about yourself?",
  "What is your dream?",
  "What is our best piece of advice?",
];

function createBlockEditor(block = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "story-block-editor";
  wrapper.innerHTML = `
    <div class="story-block-fields">
      <label class="story-block-field">
        <span class="story-block-label">Question:</span>
        <textarea class="story-block-input" rows="1" data-field="question" placeholder="Allow the signed in admin user to add their question"></textarea>
      </label>
      <label class="story-block-field">
        <span class="story-block-label">Answer:</span>
        <textarea class="story-block-input" rows="1" data-field="answer" placeholder="Allow the signed in admin user to add their answer"></textarea>
      </label>
    </div>
    <button class="story-block-delete" type="button" aria-label="Delete text block">x</button>
  `;

  const questionField = wrapper.querySelector('[data-field="question"]');
  const answerField = wrapper.querySelector('[data-field="answer"]');
  const deleteButton = wrapper.querySelector(".story-block-delete");

  if (questionField instanceof HTMLTextAreaElement) {
    questionField.value = block.question || "";
    if (block.lockQuestion) {
      questionField.readOnly = true;
      questionField.setAttribute("aria-readonly", "true");
    }
  }

  if (answerField instanceof HTMLTextAreaElement) {
    answerField.value = block.answer || "";
  }

  if (block.lockQuestion && deleteButton instanceof HTMLButtonElement) {
    deleteButton.hidden = true;
  }

  return wrapper;
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be read."));
    };

    image.src = objectUrl;
  });
}

async function buildUploadFile(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return file;
  }

  const maxDimension = 1800;
  const quality = 0.82;
  const image = await loadImageFromFile(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!(blob instanceof Blob) || blob.size >= file.size) {
    return file;
  }

  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "story-photo"}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function buildDefaultQuestionBlocks() {
  return DEFAULT_STORY_QUESTIONS.map((question) => ({
    question,
    answer: "",
    lockQuestion: true,
  }));
}

function appendBlockEditors(blocksContainer, blocks) {
  blocks.forEach((block) => {
    const editor = createBlockEditor(block);
    blocksContainer.appendChild(editor);
    editor.querySelectorAll("textarea").forEach(autoResize);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("story-form");
  const manageDeleteForms = Array.from(document.querySelectorAll(".manage-delete-form"));
  const manageList = document.querySelector(".manage-story-list");
  const manageMessage = document.getElementById("manage-message");
  const manageEmptyState = document.querySelector(".manage-empty-state");
  const blocksContainer = document.getElementById("story-blocks");
  const addBlockButton = document.getElementById("add-block");
  const saveMessage = document.getElementById("save-message");
  const storyIdInput = document.getElementById("story-id");
  const firstNameInput = document.getElementById("first-name");
  const lastNameInput = document.getElementById("last-name");
  const countryInput = document.getElementById("country");
  const interviewCityInput = document.getElementById("interview-city");
  const interviewDateInput = document.getElementById("interview-date");
  const photoInput = document.getElementById("photo");
  const previewName = document.getElementById("preview-name");
  const photoPreview = document.getElementById("story-photo-preview");
  const initialStoryElement = document.getElementById("initial-story-data");
  const initialStory = initialStoryElement?.textContent
    ? JSON.parse(initialStoryElement.textContent)
    : null;

  if (manageDeleteForms.length > 0) {
    manageDeleteForms.forEach((deleteForm) => {
      deleteForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!window.confirm("Delete this story?")) {
          return;
        }

        const card = deleteForm.closest("[data-story-card]");
        const submitButton = deleteForm.querySelector('button[type="submit"]');

        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
        }

        if (manageMessage) {
          manageMessage.textContent = "deleting...";
        }

        try {
          const response = await fetch(deleteForm.action, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "X-Requested-With": "fetch",
            },
          });
          const payload = await response.json();

          if (!response.ok) {
            if (manageMessage) {
              manageMessage.textContent =
                payload.error || "The story could not be deleted.";
            }

            if (submitButton instanceof HTMLButtonElement) {
              submitButton.disabled = false;
            }
            return;
          }

          card?.remove();

          if (manageList && !manageList.querySelector("[data-story-card]")) {
            manageList.remove();
            if (manageEmptyState instanceof HTMLElement) {
              manageEmptyState.hidden = false;
            } else if (manageMessage) {
              const empty = document.createElement("p");
              empty.className = "manage-empty-state";
              empty.textContent = "No stories yet.";
              manageMessage.insertAdjacentElement("beforebegin", empty);
            }
          }

          if (manageMessage) {
            manageMessage.textContent = "";
          }
        } catch (_error) {
          if (manageMessage) {
            manageMessage.textContent = "The story could not be deleted.";
          }

          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = false;
          }
        }
      });
    });
  }

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  blocksContainer.querySelectorAll("textarea").forEach(autoResize);

  addBlockButton.addEventListener("click", () => {
    const block = createBlockEditor();
    blocksContainer.appendChild(block);
    block.querySelectorAll("textarea").forEach(autoResize);
    block.querySelector("textarea")?.focus();
  });

  blocksContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("story-block-delete")) {
      return;
    }

    target.closest(".story-block-editor")?.remove();
  });

  document.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement) {
      autoResize(event.target);
    }
  });

  function refreshPreviewName() {
    const first = firstNameInput.value.trim() || "First Name";
    const last = lastNameInput.value.trim() || "Last Name";
    previewName.textContent = `${first} ${last}`;
  }

  firstNameInput.addEventListener("input", refreshPreviewName);
  lastNameInput.addEventListener("input", refreshPreviewName);

  if (initialStory) {
    firstNameInput.value = initialStory.firstName || "";
    lastNameInput.value = initialStory.lastName || "";
    countryInput.value = initialStory.country || "";
    interviewCityInput.value = initialStory.interviewCity || "";
    interviewDateInput.value = initialStory.interviewDate || "";
    photoPreview.src = initialStory.photoUrl || "/assets/placeholder-photo.svg";
    refreshPreviewName();

    if (Array.isArray(initialStory.blocks)) {
      appendBlockEditors(
        blocksContainer,
        initialStory.blocks.map((block) => ({
          ...block,
          lockQuestion: DEFAULT_STORY_QUESTIONS.includes(String(block.question || "").trim()),
        }))
      );
    }
  } else {
    appendBlockEditors(blocksContainer, buildDefaultQuestionBlocks());
  }

  interviewDateInput?.addEventListener("input", () => {
    const digits = interviewDateInput.value.replace(/\D/g, "").slice(0, 8);
    const pieces = [];

    if (digits.length > 0) {
      pieces.push(digits.slice(0, 2));
    }
    if (digits.length > 2) {
      pieces.push(digits.slice(2, 4));
    }
    if (digits.length > 4) {
      pieces.push(digits.slice(4, 8));
    }

    interviewDateInput.value = pieces.join("/");
  });

  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file) {
      photoPreview.src = "/assets/placeholder-photo.svg";
      return;
    }

    const url = URL.createObjectURL(file);
    photoPreview.src = url;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveMessage.textContent = "saving...";
    const submitButton = form.querySelector('.save-button');

    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
    }

    const blocks = Array.from(blocksContainer.querySelectorAll(".story-block-editor")).map(
      (block) => ({
        question:
          block.querySelector('[data-field="question"]')?.value.trim() || "",
        answer: block.querySelector('[data-field="answer"]')?.value.trim() || "",
      })
    );

    const formData = new FormData(form);
    formData.set("blocks", JSON.stringify(blocks));

    const selectedPhoto = photoInput.files?.[0];
    if (selectedPhoto) {
      try {
        const preparedPhoto = await buildUploadFile(selectedPhoto);
        formData.set("photo", preparedPhoto, preparedPhoto.name);
      } catch (_error) {
        saveMessage.textContent = "The selected photo could not be prepared.";
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
        }
        return;
      }
    }

    const storyId = storyIdInput?.value.trim();
    const endpoint = storyId ? `/api/stories/${storyId}` : "/api/stories";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : null;

      if (!response.ok) {
        if (response.status === 413) {
          saveMessage.textContent = "The uploaded photo is too large.";
        } else {
          saveMessage.textContent =
            payload?.error || `The story could not be saved (${response.status}).`;
        }
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
        }
        return;
      }

      if (payload?.storyUrl) {
        window.location.href = payload.storyUrl;
        return;
      }

      saveMessage.textContent = "The story was saved, but the page could not open.";
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
    } catch (error) {
      saveMessage.textContent =
        error instanceof Error && error.message
          ? error.message
          : "The story could not be saved.";
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
    }
  });
});
