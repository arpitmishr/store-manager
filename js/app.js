document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page-section');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active-nav'));
            btn.classList.add('active-nav');
            pages.forEach(p => p.classList.add('hidden'));
            document.getElementById(btn.getAttribute('data-target')).classList.remove('hidden');
        });
    });

    // Theme logic
    const themeBtn = document.getElementById('toggle-theme');
    if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
    
    if(themeBtn){
        themeBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        });
    }
});
