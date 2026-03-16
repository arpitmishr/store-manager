document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page-section');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active styles from all buttons
            navButtons.forEach(b => {
                b.classList.remove('bg-blue-50', 'text-blue-600', 'dark:bg-gray-700', 'dark:text-blue-400', 'font-semibold');
                b.classList.add('hover:bg-gray-100', 'dark:hover:bg-gray-700');
            });

            // Add active styles to clicked button
            btn.classList.add('bg-blue-50', 'text-blue-600', 'dark:bg-gray-700', 'dark:text-blue-400', 'font-semibold');
            btn.classList.remove('hover:bg-gray-100');

            // Hide all pages
            pages.forEach(page => page.classList.add('hidden'));

            // Show target page
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });
});
