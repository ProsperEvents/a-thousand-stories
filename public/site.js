document.addEventListener("DOMContentLoaded", () => {
  const prefetchedUrls = new Set();

  function attachPrefetchListeners(link) {
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    link.addEventListener("pointerenter", () => prefetchLink(link), { passive: true });
    link.addEventListener("focus", () => prefetchLink(link), { passive: true });
    link.addEventListener("touchstart", () => prefetchLink(link), { passive: true });
  }

  function prefetchLink(link) {
    if (!(link instanceof HTMLAnchorElement) || !link.href) {
      return;
    }

    const url = new URL(link.href, window.location.href);
    const currentUrl = new URL(window.location.href);

    if (
      url.origin !== currentUrl.origin ||
      url.hash ||
      url.pathname === currentUrl.pathname ||
      prefetchedUrls.has(url.href)
    ) {
      return;
    }

    prefetchedUrls.add(url.href);

    const prefetchTag = document.createElement("link");
    prefetchTag.rel = "prefetch";
    prefetchTag.href = url.href;
    prefetchTag.as = "document";
    document.head.appendChild(prefetchTag);
  }

  function createStoryCardLink(story) {
    const link = document.createElement("a");
    link.className = "story-card-link";
    link.href = `/stories/${encodeURIComponent(story.id)}`;

    const article = document.createElement("article");
    article.className = "polaroid-card story-card";

    const shell = document.createElement("div");
    shell.className = "polaroid-frame-shell";

    const photo = document.createElement("div");
    photo.className = "polaroid-photo";

    const photoImage = document.createElement("img");
    photoImage.src = story.photoUrl || "/assets/placeholder-photo.svg";
    photoImage.alt = `${story.firstName || ""} ${story.lastName || ""}`.trim();
    photoImage.loading = "lazy";
    photoImage.decoding = "async";
    photoImage.setAttribute("fetchpriority", "auto");

    const frameImage = document.createElement("img");
    frameImage.className = "polaroid-frame";
    frameImage.src = "/assets/polaroid-frame.png";
    frameImage.alt = "";
    frameImage.setAttribute("aria-hidden", "true");

    const caption = document.createElement("div");
    caption.className = "polaroid-caption";

    const name = document.createElement("span");
    name.className = "polaroid-name";
    name.textContent = `${story.firstName || "First Name"} ${story.lastName || "Last Name"}`;

    const meta = document.createElement("p");
    meta.className = "story-card-meta";
    meta.textContent = [story.interviewCity || "", story.interviewDate || ""]
      .filter(Boolean)
      .join(", ");

    photo.appendChild(photoImage);
    caption.appendChild(name);
    shell.appendChild(photo);
    shell.appendChild(frameImage);
    shell.appendChild(caption);
    article.appendChild(shell);
    link.appendChild(article);
    link.appendChild(meta);
    attachPrefetchListeners(link);
    return link;
  }

  async function loadMoreHomeStories() {
    const homeGrid = document.querySelector('[data-home-grid="true"]');
    const loadMoreButton = document.querySelector('[data-home-load-more="true"]');
    const loadMessage = document.getElementById("home-load-message");

    if (!(homeGrid instanceof HTMLElement) || !(loadMoreButton instanceof HTMLButtonElement)) {
      return;
    }

    if (loadMoreButton.dataset.loading === "true") {
      return;
    }

    const limit = Number(homeGrid.dataset.pageSize || "9");
    const offset = Number(homeGrid.dataset.nextOffset || "0");

    loadMoreButton.dataset.loading = "true";
    loadMoreButton.disabled = true;
    if (loadMessage) {
      loadMessage.textContent = "loading...";
    }

    try {
      const response = await fetch(`/api/stories?offset=${offset}&limit=${limit}`, {
        headers: {
          Accept: "application/json",
        },
      });
      const payload = await response.json();

      if (!response.ok || !Array.isArray(payload.items)) {
        throw new Error(payload?.error || "More stories could not be loaded.");
      }

      payload.items.forEach((story) => {
        homeGrid.appendChild(createStoryCardLink(story));
      });

      homeGrid.dataset.nextOffset = String(payload.nextOffset || offset);
      homeGrid.dataset.hasMore = payload.hasMore ? "true" : "false";
      loadMoreButton.hidden = !payload.hasMore;

      if (loadMessage) {
        loadMessage.textContent = "";
      }
    } catch (error) {
      if (loadMessage) {
        loadMessage.textContent =
          error instanceof Error ? error.message : "More stories could not be loaded.";
      }
    } finally {
      loadMoreButton.dataset.loading = "false";
      loadMoreButton.disabled = false;
    }
  }

  document.querySelectorAll('a[href^="/"]').forEach(attachPrefetchListeners);

  const warmLikelyNextPages = () => {
    document
      .querySelectorAll(".site-nav a, .story-card-link")
      .forEach((link, index) => {
        if (index < 8) {
          prefetchLink(link);
        }
      });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warmLikelyNextPages, { timeout: 1200 });
  } else {
    window.setTimeout(warmLikelyNextPages, 600);
  }

  const loadMoreButton = document.querySelector('[data-home-load-more="true"]');
  if (loadMoreButton instanceof HTMLButtonElement) {
    loadMoreButton.addEventListener("click", () => {
      void loadMoreHomeStories();
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !loadMoreButton.hidden) {
              void loadMoreHomeStories();
            }
          });
        },
        {
          rootMargin: "320px 0px",
        }
      );

      observer.observe(loadMoreButton);
    }
  }

  document.querySelectorAll('[data-back-link="true"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      if (window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    });
  });
});
