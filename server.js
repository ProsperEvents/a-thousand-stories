const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { put, del, list } = require("@vercel/blob");

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_NAME = "a thousand stories";
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const ADMIN_COOKIE = "ats_admin";
const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const STORIES_FILE = path.join(DATA_DIR, "stories.json");
const DEFAULT_PHOTO_URL = "/assets/placeholder-photo.svg";
const STORIES_BLOB_PATH = "stories/stories.json";
const ATTRIBUTION_HTML =
  '<div class="site-attribution">Icons made from <a href="https://www.onlinewebfonts.com/icon" target="_blank" rel="noreferrer">svg icons</a> is licensed by CC BY 4.0</div>';
const ABOUT_COPY =
  'The goal of "a thousand stories" is exactly as the name implies. To collect the stories of a thousand people from all different places, all with different experiences, and different lives. In this ever changing world where we feel so divided, overwhelmed and sometimes a little lost it can be good to take a step back to reflect on others, and ourselves. In all this, we find that one thing unites us all. Regardless of age, country, religion, language, sex, wealth or other we are all human. Take this time to think about your story.';

function ensureProjectFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(STORIES_FILE)) {
    fs.writeFileSync(STORIES_FILE, JSON.stringify([], null, 2));
  }
}

function isBlobStorageEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isAdminPasswordConfigured() {
  return Boolean(ADMIN_PASSWORD);
}

function readLocalStories() {
  try {
    const raw = fs.readFileSync(STORIES_FILE, "utf8");
    const stories = JSON.parse(raw);
    return Array.isArray(stories) ? stories : [];
  } catch (error) {
    return [];
  }
}

async function readStories() {
  if (!isBlobStorageEnabled()) {
    return readLocalStories();
  }

  try {
    const { blobs } = await list({ prefix: STORIES_BLOB_PATH, limit: 10 });
    const storyBlob =
      blobs.find((blob) => blob.pathname === STORIES_BLOB_PATH) || blobs[0];

    if (!storyBlob) {
      return readLocalStories();
    }

    const response = await fetch(storyBlob.url, { cache: "no-store" });
    if (!response.ok) {
      return readLocalStories();
    }

    const stories = await response.json();
    return Array.isArray(stories) ? stories : [];
  } catch (error) {
    return readLocalStories();
  }
}

async function writeStories(stories) {
  if (isBlobStorageEnabled()) {
    await put(STORIES_BLOB_PATH, JSON.stringify(stories, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      overwrite: true,
    });
    return;
  }

  fs.writeFileSync(STORIES_FILE, JSON.stringify(stories, null, 2));
}

function findStoryById(stories, id) {
  return stories.find((story) => story.id === id);
}

function serializeForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function parseInterviewDateValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, day, month, rawYear] = slashMatch;
    const normalizedYear =
      rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
    return Date.UTC(normalizedYear, Number(month) - 1, Number(day));
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function isValidInterviewDateFormat(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return false;
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function sortStoriesByInterviewDate(stories) {
  return [...stories].sort((left, right) => {
    const dateDifference =
      parseInterviewDateValue(right.interviewDate) -
      parseInterviewDateValue(left.interviewDate);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return String(right.id || "").localeCompare(String(left.id || ""));
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseCookies(req) {
  const source = req.headers.cookie;
  if (!source) {
    return {};
  }

  return source.split(";").reduce((cookies, pair) => {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function isAdminAuthenticated(req) {
  return parseCookies(req)[ADMIN_COOKIE] === "granted";
}

function slugifyPart(value) {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "story";
}

function createStoryId(firstName, lastName) {
  return `${slugifyPart(firstName)}-${slugifyPart(lastName)}-${Date.now()}`;
}

function localPathFromPublicUrl(publicUrl) {
  return path.join(PUBLIC_DIR, String(publicUrl || "").replace(/^\/+/, ""));
}

function buildUploadFilename(file) {
  const extension =
    path.extname(file?.originalname || "").toLowerCase() || ".png";
  const safeBase = slugifyPart(path.basename(file?.originalname || "upload", extension));
  return `${safeBase}-${Date.now()}${extension}`;
}

async function storeUploadedPhoto(file) {
  if (!file) {
    return DEFAULT_PHOTO_URL;
  }

  const filename = buildUploadFilename(file);

  if (isBlobStorageEnabled()) {
    const blob = await put(`uploads/${filename}`, file.buffer, {
      access: "public",
      addRandomSuffix: false,
      overwrite: true,
      contentType: file.mimetype || "application/octet-stream",
    });
    return blob.url;
  }

  fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
  return `/uploads/${filename}`;
}

async function deleteStoredPhoto(photoUrl) {
  if (!photoUrl || photoUrl === DEFAULT_PHOTO_URL) {
    return;
  }

  if (isBlobStorageEnabled()) {
    if (String(photoUrl).startsWith("http")) {
      await del(photoUrl).catch((error) => {
        console.error("Unable to delete blob photo:", error);
      });
    }
    return;
  }

  if (String(photoUrl).startsWith("/uploads/")) {
    fs.unlink(localPathFromPublicUrl(photoUrl), () => {});
  }
}

function buildPage({ pageClass = "", title = SITE_NAME, body, scriptPath = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/png" href="/assets/site-logo.png" />
    <link rel="shortcut icon" href="/assets/site-logo.png" />
    <link rel="apple-touch-icon" href="/assets/site-logo.png" />
    <link rel="preload" href="/assets/polaroid-frame.png" as="image" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="${escapeHtml(pageClass)}">
    ${body}
    ${ATTRIBUTION_HTML}
    <script src="/site.js" defer></script>
    ${scriptPath ? `<script src="${escapeHtml(scriptPath)}" defer></script>` : ""}
  </body>
</html>`;
}

function renderHeader() {
  return `<header class="site-header">
    <a class="site-logo" href="/home">${SITE_NAME}</a>
    <nav class="site-nav" aria-label="Primary">
      <a href="/home">home</a>
      <a href="/about">about</a>
      <a href="/admin">admin</a>
    </nav>
  </header>`;
}

function renderEnterPage() {
  return buildPage({
    pageClass: "enter-page-body",
    body: `<main class="enter-page">
      <h1 class="enter-title">${SITE_NAME}</h1>
      <a class="enter-link" href="/home">enter</a>
    </main>`,
  });
}

function renderPolaroidCard({
  photoUrl,
  firstName,
  lastName,
  cardClass = "",
  imageId = "",
  nameId = "",
  altText = "",
  imageLoading = "lazy",
  imageFetchPriority = "auto",
}) {
  const fullName = `${firstName} ${lastName}`.trim();

  return `<article class="polaroid-card ${escapeHtml(cardClass)}">
    <div class="polaroid-frame-shell">
      <div class="polaroid-photo">
        <img ${imageId ? `id="${escapeHtml(imageId)}"` : ""} src="${escapeHtml(
          photoUrl || DEFAULT_PHOTO_URL
        )}" alt="${escapeHtml(altText || fullName)}" loading="${escapeHtml(
          imageLoading
        )}" decoding="async" fetchpriority="${escapeHtml(imageFetchPriority)}" />
      </div>
      <img class="polaroid-frame" src="/assets/polaroid-frame.png" alt="" aria-hidden="true" />
      <div class="polaroid-caption">
        <span ${nameId ? `id="${escapeHtml(nameId)}"` : ""} class="polaroid-name">${escapeHtml(
          fullName || "First Name Last Name"
        )}</span>
      </div>
    </div>
  </article>`;
}

function renderHomePage(stories) {
  const cards = stories
    .map(
      (story) => `<a class="story-card-link" href="/stories/${encodeURIComponent(story.id)}">
        ${renderPolaroidCard({
          photoUrl: story.photoUrl,
          firstName: story.firstName,
          lastName: story.lastName,
          cardClass: "story-card",
        })}
        <p class="story-card-meta">${escapeHtml(story.interviewCity || "")}${
          story.interviewCity && story.interviewDate ? ", " : ""
        }${escapeHtml(story.interviewDate || "")}</p>
      </a>`
    )
    .join("");

  return buildPage({
    pageClass: "site-page-body",
    body: `<main class="page-shell">
      ${renderHeader()}
      <section class="content-page content-page-home">
        <h1 class="page-title">home</h1>
      </section>
      <section class="home-grid" aria-label="Story gallery">${cards}</section>
    </main>`,
  });
}

function renderAboutPage() {
  return buildPage({
    pageClass: "site-page-body",
    body: `<main class="page-shell">
      ${renderHeader()}
      <section class="content-page content-page-about">
        <h1 class="page-title">about</h1>
        <p class="about-copy">${escapeHtml(ABOUT_COPY)}</p>
      </section>
    </main>`,
  });
}

function renderAdminLoginPage(errorType = "") {
  const errorMessage =
    errorType === "missing"
      ? "Admin login is not configured yet."
      : errorType === "invalid"
        ? "That password was not correct."
        : "";

  return buildPage({
    pageClass: "site-page-body",
    body: `<main class="page-shell">
      ${renderHeader()}
      <section class="content-page content-page-admin-login">
        <h1 class="page-title">admin</h1>
        <form class="admin-login-form" action="/admin/login" method="post">
          <label class="admin-login-row">
            <span class="admin-login-label">password:</span>
            <input class="admin-password-input" name="password" type="password" autocomplete="current-password" autofocus />
          </label>
          ${errorMessage ? `<p class="admin-login-error">${escapeHtml(errorMessage)}</p>` : ""}
          <button class="visually-hidden" type="submit">enter</button>
        </form>
      </section>
    </main>`,
  });
}

function renderPreviewCard() {
  return renderPolaroidCard({
    photoUrl: DEFAULT_PHOTO_URL,
    firstName: "First Name",
    lastName: "Last Name",
    cardClass: "polaroid-card-preview",
    imageId: "story-photo-preview",
    nameId: "preview-name",
    altText: "Story preview",
    imageLoading: "eager",
    imageFetchPriority: "high",
  });
}

function renderAdminCreationPage(initialStory = null) {
  const submitLabel = initialStory ? "update" : "save";
  const initialStoryScript = serializeForScript(
    initialStory
      ? {
          id: initialStory.id,
          firstName: initialStory.firstName || "",
          lastName: initialStory.lastName || "",
          country: initialStory.country || "",
          interviewCity: initialStory.interviewCity || "",
          interviewDate: initialStory.interviewDate || "",
          photoUrl: initialStory.photoUrl || DEFAULT_PHOTO_URL,
          blocks: Array.isArray(initialStory.blocks) ? initialStory.blocks : [],
        }
      : null
  );

  return buildPage({
    pageClass: "site-page-body",
    scriptPath: "/admin.js",
    body: `<main class="page-shell">
      ${renderHeader()}
      <section class="admin-creation-page">
        <form id="story-form" class="admin-creation-form" enctype="multipart/form-data">
          <input id="story-id" name="storyId" type="hidden" value="${escapeHtml(
            initialStory?.id || ""
          )}" />
          <div class="admin-toolbar">
            <a class="admin-secondary-link" href="/admin/manage">manage</a>
            ${
              initialStory
                ? '<a class="admin-secondary-link" href="/admin/create">new story</a>'
                : ""
            }
          </div>
          <div class="admin-name-row">
            <input class="admin-input admin-name-input" id="first-name" name="firstName" type="text" placeholder="First Name" required />
            <input class="admin-input admin-name-input" id="last-name" name="lastName" type="text" placeholder="Last Name" required />
          </div>

          <div class="admin-meta-row">
            <label class="admin-meta-field">
              <span>Interviewed in:</span>
              <input class="admin-input admin-meta-input" id="interview-city" name="interviewCity" type="text" placeholder="city" required />
            </label>
            <label class="admin-meta-field">
              <span>Interviewed on:</span>
              <input class="admin-input admin-meta-input" id="interview-date" name="interviewDate" type="text" placeholder="dd/mm/yyyy" inputmode="numeric" pattern="\\d{2}/\\d{2}/\\d{4}" title="Use the format dd/mm/yyyy" required />
            </label>
          </div>

          <div class="admin-country-row">
            <input class="admin-input admin-country-input" id="country" name="country" type="text" placeholder="Country" required />
            <label class="admin-upload-label">
              <span>Upload photo</span>
              <input id="photo" name="photo" type="file" accept="image/*" />
            </label>
          </div>

          <div class="admin-editor-layout">
            <div class="admin-preview-column">
              ${renderPreviewCard()}
            </div>

            <div class="admin-blocks-column">
              <div id="story-blocks" class="story-blocks-editor"></div>
            </div>
          </div>

          <div class="admin-actions">
            <button id="add-block" class="plus-button" type="button" aria-label="Add text block">+</button>
            <button class="save-button" type="submit">${submitLabel}</button>
            <p id="save-message" class="save-message" aria-live="polite"></p>
          </div>
        </form>
        <script id="initial-story-data" type="application/json">${initialStoryScript}</script>
      </section>
    </main>`,
  });
}

function renderAdminManagePage(stories) {
  const items = sortStoriesByInterviewDate(stories)
    .map(
      (story) => `<article class="manage-story-card">
        <div class="manage-story-copy">
          <h2 class="manage-story-name">${escapeHtml(story.firstName)} ${escapeHtml(
            story.lastName
          )}</h2>
          <p class="manage-story-meta">${escapeHtml(story.interviewCity || "")}${
            story.interviewCity && story.interviewDate ? ", " : ""
          }${escapeHtml(story.interviewDate || "")}</p>
        </div>
        <div class="manage-story-actions">
          <a class="admin-secondary-link" href="/stories/${encodeURIComponent(story.id)}">view</a>
          <a class="admin-secondary-link" href="/admin/edit/${encodeURIComponent(story.id)}">edit</a>
          <form action="/admin/stories/${encodeURIComponent(
            story.id
          )}/delete" method="post" onsubmit="return confirm('Delete this story?');">
            <button class="admin-secondary-link admin-secondary-link-danger" type="submit">delete</button>
          </form>
        </div>
      </article>`
    )
    .join("");

  return buildPage({
    pageClass: "site-page-body",
    body: `<main class="page-shell">
      ${renderHeader()}
      <section class="content-page content-page-home">
        <h1 class="page-title">manage</h1>
      </section>
      <section class="manage-page">
        <div class="admin-toolbar admin-toolbar-manage">
          <a class="admin-secondary-link" href="/admin/create">new story</a>
        </div>
        ${
          items
            ? `<div class="manage-story-list">${items}</div>`
            : '<p class="manage-empty-state">No stories yet.</p>'
        }
      </section>
    </main>`,
  });
}

function renderStoryCard(story) {
  return renderPolaroidCard({
    photoUrl: story.photoUrl,
    firstName: story.firstName,
    lastName: story.lastName,
    cardClass: "story-detail-card",
    imageLoading: "eager",
    imageFetchPriority: "high",
  });
}

function renderCompactBlock(block) {
  const lines = [
    block.question
      ? `<p><span class="story-qa-label">Q:</span> ${escapeHtml(block.question)}</p>`
      : "",
    block.answer
      ? `<p><span class="story-qa-label">A:</span> ${escapeHtml(block.answer)}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return lines ? `<article class="story-qa-compact">${lines}</article>` : "";
}

function renderLongBlock(block) {
  const question = block.question
    ? `<p class="story-qa-heading"><span class="story-qa-label">Q:</span> ${escapeHtml(
        block.question
      )}</p>`
    : "";
  const answer = block.answer
    ? `<p class="story-qa-body"><span class="story-qa-label">A:</span> ${escapeHtml(
        block.answer
      )}</p>`
    : "";

  return question || answer
    ? `<article class="story-qa-long">${question}${answer}</article>`
    : "";
}

function renderStoryPage(story) {
  const blocks = Array.isArray(story.blocks)
    ? story.blocks.filter((block) => block && (block.question || block.answer))
    : [];
  const topBlocks = blocks.slice(0, 5).map(renderCompactBlock).join("");
  const fullBlocks = blocks.slice(5).map(renderLongBlock).join("");

  return buildPage({
    pageClass: "site-page-body story-view-body",
    title: `${story.firstName} ${story.lastName} | ${SITE_NAME}`,
    body: `<main class="page-shell">
      ${renderHeader()}
      <article class="story-page">
        <header class="story-header">
          <a class="story-back-link" href="/home" data-back-link="true" aria-label="Go back">←</a>
          <div class="story-title-row">
            <h1 class="story-title">${escapeHtml(story.firstName)} ${escapeHtml(story.lastName)}</h1>
          </div>
          <div class="story-meta-line">
            <p>Interviewed in: ${escapeHtml(story.interviewCity || "city")}</p>
            <p>Interviewed on: ${escapeHtml(story.interviewDate || "date")}</p>
          </div>
        </header>

        <section class="story-top-layout${topBlocks ? "" : " story-top-layout-single"}">
          <div class="story-photo-column">
            ${renderStoryCard(story)}
          </div>
          ${
            topBlocks
              ? `<div class="story-sidebar-column">
            ${topBlocks}
          </div>`
              : ""
          }
        </section>

        ${
          fullBlocks
            ? `<section class="story-body-blocks">
          ${fullBlocks}
        </section>`
            : ""
        }
      </article>
    </main>`,
  });
}

function renderNotFoundPage() {
  return buildPage({
    pageClass: "site-page-body",
    title: `Not found | ${SITE_NAME}`,
    body: `<main class="page-shell">
      ${renderHeader()}
      <section class="content-page">
        <h1 class="page-title">not found</h1>
      </section>
    </main>`,
  });
}

const upload = multer({ storage: multer.memoryStorage() });

ensureProjectFiles();

app.use(express.urlencoded({ extended: true }));
app.use(
  "/assets",
  express.static(path.join(PUBLIC_DIR, "assets"), {
    maxAge: "1y",
    immutable: true,
  })
);
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "1h",
  })
);
app.use(express.static(PUBLIC_DIR));

app.get("/", (_req, res) => {
  res.send(renderEnterPage());
});

app.get("/home", async (_req, res) => {
  res.send(renderHomePage(sortStoriesByInterviewDate(await readStories())));
});

app.get("/about", (_req, res) => {
  res.send(renderAboutPage());
});

app.get("/admin", (req, res) => {
  res.send(renderAdminLoginPage(String(req.query.error || "")));
});

app.post("/admin/login", (req, res) => {
  if (!isAdminPasswordConfigured()) {
    res.redirect("/admin?error=missing");
    return;
  }

  const password = String(req.body.password || "");
  if (password !== ADMIN_PASSWORD) {
    res.redirect("/admin?error=invalid");
    return;
  }

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=granted; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
  );
  res.redirect("/admin/create");
});

app.get("/admin/create", (req, res) => {
  if (!isAdminAuthenticated(req)) {
    res.redirect("/admin");
    return;
  }

  res.send(renderAdminCreationPage());
});

app.get("/admin/manage", async (req, res) => {
  if (!isAdminAuthenticated(req)) {
    res.redirect("/admin");
    return;
  }

  res.send(renderAdminManagePage(await readStories()));
});

app.get("/admin/edit/:id", async (req, res) => {
  if (!isAdminAuthenticated(req)) {
    res.redirect("/admin");
    return;
  }

  const story = findStoryById(await readStories(), req.params.id);
  if (!story) {
    res.status(404).send(renderNotFoundPage());
    return;
  }

  res.send(renderAdminCreationPage(story));
});

app.get("/stories/:id", async (req, res) => {
  const story = (await readStories()).find((entry) => entry.id === req.params.id);
  if (!story) {
    res.status(404).send(renderNotFoundPage());
    return;
  }

  res.send(renderStoryPage(story));
});

app.get("/api/stories", async (_req, res) => {
  res.json(sortStoriesByInterviewDate(await readStories()));
});

app.post("/api/stories", upload.single("photo"), async (req, res) => {
  if (!isAdminAuthenticated(req)) {
    res.status(401).json({ error: "You must sign in as admin first." });
    return;
  }

  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const country = String(req.body.country || "").trim();
  const interviewCity = String(req.body.interviewCity || "").trim();
  const interviewDate = String(req.body.interviewDate || "").trim();

  let blocks = [];
  try {
    blocks = JSON.parse(String(req.body.blocks || "[]"));
  } catch (error) {
    blocks = [];
  }

  const normalizedBlocks = blocks
    .map((block) => ({
      question: String(block.question || "").trim(),
      answer: String(block.answer || "").trim(),
    }))
    .filter((block) => block.question || block.answer);

  if (!firstName || !lastName || !country || !interviewCity || !interviewDate) {
    res.status(400).json({ error: "Please fill out every story detail." });
    return;
  }

  if (!isValidInterviewDateFormat(interviewDate)) {
    res
      .status(400)
      .json({ error: "Please enter the interview date as dd/mm/yyyy." });
    return;
  }

  const photoUrl = req.file
    ? await storeUploadedPhoto(req.file)
    : DEFAULT_PHOTO_URL;

  const story = {
    id: createStoryId(firstName, lastName),
    firstName,
    lastName,
    country,
    interviewCity,
    interviewDate,
    photoUrl,
    blocks: normalizedBlocks,
  };

  const stories = await readStories();
  stories.unshift(story);
  await writeStories(stories);

  res.status(201).json({
    ok: true,
    storyUrl: `/stories/${story.id}`,
  });
});

app.post("/api/stories/:id", upload.single("photo"), async (req, res) => {
  if (!isAdminAuthenticated(req)) {
    res.status(401).json({ error: "You must sign in as admin first." });
    return;
  }

  const stories = await readStories();
  const existingStory = findStoryById(stories, req.params.id);

  if (!existingStory) {
    res.status(404).json({ error: "Story not found." });
    return;
  }

  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const country = String(req.body.country || "").trim();
  const interviewCity = String(req.body.interviewCity || "").trim();
  const interviewDate = String(req.body.interviewDate || "").trim();

  let blocks = [];
  try {
    blocks = JSON.parse(String(req.body.blocks || "[]"));
  } catch (error) {
    blocks = [];
  }

  const normalizedBlocks = blocks
    .map((block) => ({
      question: String(block.question || "").trim(),
      answer: String(block.answer || "").trim(),
    }))
    .filter((block) => block.question || block.answer);

  if (!firstName || !lastName || !country || !interviewCity || !interviewDate) {
    res.status(400).json({ error: "Please fill out every story detail." });
    return;
  }

  if (!isValidInterviewDateFormat(interviewDate)) {
    res
      .status(400)
      .json({ error: "Please enter the interview date as dd/mm/yyyy." });
    return;
  }

  let nextPhotoUrl = existingStory.photoUrl || DEFAULT_PHOTO_URL;
  if (req.file) {
    nextPhotoUrl = await storeUploadedPhoto(req.file);
    await deleteStoredPhoto(existingStory.photoUrl);
  }

  const updatedStory = {
    ...existingStory,
    firstName,
    lastName,
    country,
    interviewCity,
    interviewDate,
    photoUrl: nextPhotoUrl,
    blocks: normalizedBlocks,
  };

  await writeStories(
    stories.map((story) => (story.id === existingStory.id ? updatedStory : story))
  );

  res.json({
    ok: true,
    storyUrl: `/stories/${updatedStory.id}`,
  });
});

app.post("/admin/stories/:id/delete", async (req, res) => {
  if (!isAdminAuthenticated(req)) {
    res.redirect("/admin");
    return;
  }

  try {
    const stories = await readStories();
    const story = findStoryById(stories, req.params.id);
    if (!story) {
      res.redirect("/admin/manage");
      return;
    }

    await writeStories(stories.filter((entry) => entry.id !== story.id));
    await deleteStoredPhoto(story.photoUrl);

    res.redirect("/admin/manage");
  } catch (error) {
    console.error(`Unable to delete story ${req.params.id}:`, error);
    res.redirect("/admin/manage");
  }
});

app.use((_req, res) => {
  res.status(404).send(renderNotFoundPage());
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`a thousand stories is running at http://localhost:${PORT}`);
  });
}

module.exports = app;
