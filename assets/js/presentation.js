(function () {
  'use strict';

  const toc = document.querySelector('.toc');
  const navList = toc.querySelector('ol');
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href')));
  const topButton = document.querySelector('.back-to-top');
  let currentLink = null;
  let pendingFrame = false;

  function updatePageState() {
    pendingFrame = false;
    const offset = toc.getBoundingClientRect().height + 20;
    document.documentElement.style.setProperty('--toc-offset', offset + 'px');
    let active = 0;
    sections.forEach((section, index) => {
      if (section && section.getBoundingClientRect().top <= offset + 4) active = index;
    });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      active = sections.length - 1;
    }
    const nextLink = links[active];
    if (nextLink !== currentLink) {
      links.forEach(link => {
        const selected = link === nextLink;
        link.classList.toggle('is-active', selected);
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      currentLink = nextLink;
      const bounds = nextLink.getBoundingClientRect();
      const viewport = navList.getBoundingClientRect();
      if (bounds.left < viewport.left) navList.scrollLeft -= viewport.left - bounds.left + 8;
      else if (bounds.right > viewport.right) navList.scrollLeft += bounds.right - viewport.right + 8;
    }
    topButton.hidden = window.scrollY <= 650;
    topButton.classList.toggle('visible', !topButton.hidden);
  }

  function scheduleUpdate() {
    if (pendingFrame) return;
    pendingFrame = true;
    window.requestAnimationFrame(updatePageState);
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', () => {
    currentLink = null;
    scheduleUpdate();
  });
  window.addEventListener('pageshow', scheduleUpdate);
  updatePageState();

  const viewer = document.getElementById('image-viewer');
  const image = viewer.querySelector('img');
  const caption = viewer.querySelector('p');
  const closeButton = viewer.querySelector('button');
  let opener = null;
  let previousOverflow = '';

  function closeImage() {
    if (viewer.hidden) return;
    viewer.hidden = true;
    document.body.style.overflow = previousOverflow;
    image.removeAttribute('src');
    if (opener) opener.focus({ preventScroll: true });
  }

  document.querySelectorAll('.section figure img').forEach(img => {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', '放大查看：' + img.alt);
    function openImage() {
      opener = img;
      previousOverflow = document.body.style.overflow;
      image.src = img.currentSrc || img.src;
      image.alt = img.alt;
      caption.textContent = img.closest('figure').querySelector('figcaption')?.textContent || '';
      viewer.hidden = false;
      document.body.style.overflow = 'hidden';
      closeButton.focus();
    }
    img.addEventListener('click', openImage);
    img.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openImage();
      }
    });
  });
  viewer.addEventListener('click', event => {
    if (event.target === viewer) closeImage();
  });
  closeButton.addEventListener('click', closeImage);
  document.addEventListener('keydown', event => {
    if (viewer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeImage();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      closeButton.focus();
    }
  });
  topButton.addEventListener('click', () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });
})();
