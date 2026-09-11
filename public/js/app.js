document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-share-url]');
  if (!button) return;
  event.preventDefault();

  const url = button.getAttribute('data-share-url');
  const title = button.getAttribute('data-share-title') || document.title;

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (err) {
      // user cancelled the share sheet - nothing to do
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
  } catch (err) {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }

  const label = button.getAttribute('data-copied-label') || 'Copied!';
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-geolocate]');
  if (!button) return;
  event.preventDefault();

  if (!navigator.geolocation) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = button.getAttribute('data-locating-label') || original;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const url = new URL(window.location.href);
      url.searchParams.set('lat', position.coords.latitude.toFixed(5));
      url.searchParams.set('lng', position.coords.longitude.toFixed(5));
      window.location.href = url.toString();
    },
    () => {
      button.disabled = false;
      button.textContent = original;
    },
    { timeout: 8000 }
  );
});

// Dropdowns are plain <details> so they work without JS; this only adds the
// click-outside / Escape dismissal a native details element doesn't give you.
document.addEventListener('click', (event) => {
  document.querySelectorAll('details.menu[open], details.app-menu[open]').forEach((open) => {
    if (!open.contains(event.target)) open.removeAttribute('open');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('details.menu[open], details.app-menu[open]').forEach((open) => {
    open.removeAttribute('open');
  });
});
