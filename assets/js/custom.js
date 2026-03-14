/**
 * Datadripco Theme JS
 */

(function() {
    'use strict';

    // Mobile Menu
    const menuToggle = document.getElementById('menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            const isOpen = mobileMenu.classList.contains('is-open');
            
            if (isOpen) {
                mobileMenu.classList.remove('is-open');
                menuToggle.classList.remove('is-active');
                menuToggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            } else {
                mobileMenu.classList.add('is-open');
                menuToggle.classList.add('is-active');
                menuToggle.setAttribute('aria-expanded', 'true');
                document.body.style.overflow = 'hidden';
            }
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenu.classList.contains('is-open')) {
                mobileMenu.classList.remove('is-open');
                menuToggle.classList.remove('is-active');
                document.body.style.overflow = '';
            }
        });
    }

    // Header scroll effect
    const header = document.getElementById('site-header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        
        if (currentScroll > 50) {
            header?.classList.add('is-scrolled');
        } else {
            header?.classList.remove('is-scrolled');
        }
        
        lastScroll = currentScroll;
    }, { passive: true });

    // External links
    document.querySelectorAll('a[href^="http"]').forEach(link => {
        if (!link.href.includes(window.location.host)) {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        }
    });

    // ── Ticker bar: stick through hero, then hide ──────────────────────────────
    const ticker = document.querySelector('.ticker-bar');
    const siteHeader = document.querySelector('.site-header');

    if (ticker) {
        const heroSection = document.querySelector('.hero-section');

        if (heroSection) {
            // Homepage: hide ticker when hero scrolls completely out of view
            const heroObserver = new IntersectionObserver(
                ([entry]) => {
                    const pastHero = entry.boundingClientRect.bottom <= 0;
                    ticker.classList.toggle('ticker-hidden', pastHero);
                    siteHeader && siteHeader.classList.toggle('no-ticker', pastHero);
                },
                { threshold: 0 }
            );
            heroObserver.observe(heroSection);
        } else {
            // Non-homepage: hide ticker after scrolling 80px (ticker height × 2)
            let tickerHidden = false;
            window.addEventListener('scroll', () => {
                if (window.scrollY > 80 && !tickerHidden) {
                    ticker.classList.add('ticker-hidden');
                    siteHeader && siteHeader.classList.add('no-ticker');
                    tickerHidden = true;
                } else if (window.scrollY <= 80 && tickerHidden) {
                    ticker.classList.remove('ticker-hidden');
                    siteHeader && siteHeader.classList.remove('no-ticker');
                    tickerHidden = false;
                }
            }, { passive: true });
        }
    }

})();
