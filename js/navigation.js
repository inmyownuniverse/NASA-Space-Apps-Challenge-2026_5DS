export function bindNavigation() {
  const menu = document.getElementById('menu-toggle');
  const setMenu = (open) => menu.setAttribute('aria-expanded', String(open));
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  document.getElementById('site-navigation').addEventListener('click', (event) => {
    if (event.target.closest('a') && menu.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menu.focus();
    }
  });
  document.querySelector('.header').addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menu.focus();
    }
  });
  return () => setMenu(false);
}
