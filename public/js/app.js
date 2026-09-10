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
