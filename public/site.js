document.addEventListener("DOMContentLoaded", () => {
  const prefetchedUrls = new Set();

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

  document.querySelectorAll('a[href^="/"]').forEach((link) => {
    link.addEventListener("pointerenter", () => prefetchLink(link), { passive: true });
    link.addEventListener("focus", () => prefetchLink(link), { passive: true });
    link.addEventListener("touchstart", () => prefetchLink(link), { passive: true });
  });

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
