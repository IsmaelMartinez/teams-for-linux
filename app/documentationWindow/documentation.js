const iframe = document.getElementById('docs-frame');
const loading = document.getElementById('loading');

iframe.addEventListener('load', () => {
    loading.classList.add('hidden');
});

iframe.addEventListener('error', () => {
    while (loading.firstChild) {
        loading.firstChild.remove();
    }

    const title = document.createElement('h2');
    title.textContent = 'Error Loading Documentation';

    const message = document.createElement('p');
    message.textContent = 'Unable to load the documentation. Please check your internet connection.';

    loading.appendChild(title);
    loading.appendChild(message);
});
