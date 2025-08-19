const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDarkMode || true) {
    document.body.classList.add('dark-mode');
}