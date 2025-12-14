const iframe = document.getElementById('docs-frame');
const loading = document.getElementById('loading');

iframe.addEventListener('load', () => {
	loading.classList.add('hidden');
});

iframe.addEventListener('error', () => {
	// Clear existing content safely
	while (loading.firstChild) {
		loading.firstChild.remove();
	}

	// Create error message elements safely
	const title = document.createElement('h2');
	title.textContent = 'Error Loading Documentation';

	const message = document.createElement('p');
	message.textContent = 'Unable to load the documentation. Please check your internet connection.';

	loading.appendChild(title);
	loading.appendChild(message);
});
