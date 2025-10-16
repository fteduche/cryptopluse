document.addEventListener('DOMContentLoaded', () => {
    // Dynamically insert current year
    const footerYearEl = document.getElementById('footer-year');
    if (footerYearEl) {
        footerYearEl.textContent = new Date().getFullYear();
    }

    // Optional: Scroll-to-top button
    const scrollBtn = document.createElement('button');
    scrollBtn.id = 'scroll-top-btn';
    scrollBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    scrollBtn.className =
        'fixed bottom-6 right-6 bg-indigo-600 text-white rounded-full w-10 h-10 flex justify-center items-center shadow-lg hover:bg-indigo-700 transition opacity-0 pointer-events-none';
    document.body.appendChild(scrollBtn);

    // Scroll visibility logic
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollBtn.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            scrollBtn.classList.add('opacity-0', 'pointer-events-none');
        }
    });

    // Smooth scroll to top
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});
